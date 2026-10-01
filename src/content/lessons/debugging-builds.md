---
title: Debugging builds
stage: 4
order: 27
slug: debugging-builds
summary: Read build logs, keep and inspect failed build directories, rerun phases by hand, and trace closures.
minutes: 15
---

## Why this matters

A failing Nix build gives you a store path and "builder failed with exit code 1". The information exists; you have to know which command exposes it. This lesson is the toolbelt, plus the honest truth about documentation: for builders, the nixpkgs source is the manual.

## Concept

### Read the log

`nix build -L` streams the log while building (`--print-build-logs`). After the fact, `nix log` prints the stored log for a derivation or output path:

```sh
nix log /nix/store/fq617n09r9rshxfy1i89q842d56gx723-greeting-dir.drv
```

```text
got build log for '/nix/store/fq617n09r9rshxfy1i89q842d56gx723-greeting-dir.drv' from 'daemon'
```

For a path that was **substituted** from the cache instead of built locally there is no local log. Verified: `nix log nixpkgs#hello` prints `error: build log of 'flake:nixpkgs#hello' is not available`.

### Keep the failed build directory

`--keep-failed` (a setting, so it works as a flag on any `nix` command) stops Nix from deleting the scratch directory:

```sh
nix build --impure --no-link -L --keep-failed --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in pkgs.runCommand "broken" { } "echo partial work > partial.txt; exit 1"'
```

```text
note: keeping build directory "/nix/var/nix/builds/nix-99268-482289609/build"
```

Inside you find whatever the build wrote plus `env-vars`, a dump of every variable the builder saw. Verified listing:

```text
-rw-r--r-- 1 nixbld01 nixbld   48 Oct  1 08:55 .attr-0l2nkwhif96f51f4amnlf414lhl4rv9vh8iffyp431v6s28gsr90
-rw------- 1 nixbld01 nixbld 4082 Oct  1 08:55 env-vars
-rw-r--r-- 1 nixbld01 nixbld   13 Oct  1 08:55 partial.txt
```

The files belong to the build user. `env-vars` is mode 600, so reading it on a multi-user install needs root. Verify: `ls -la` on the printed directory.

### Rerun phases by hand

`nix develop` on a **package** (not a shell) gives you its build environment. The phase functions are not exported to a non-interactive bash; source the setup script first, or use the phase flags:

```sh
cd $(mktemp -d)
nix develop --impure -f default.nix --unpack
cd src
nix develop --impure -f default.nix --install
```

```text
Running phase: unpackPhase
unpacking source archive /nix/store/dy86hwkggvbzw2y977w1k90ff9svl0a2-src
source root is src
Running phase: installPhase
```

The result landed at `src/outputs/out/bin/greet`: in `nix develop`, `$out` points inside your working directory. The flags verified in `nix develop --help`: `--unpack`, `--configure`, `--build`, `--check`, `--install`, `--installcheck`, `--phase <name>`. Interactively, `nix develop -f default.nix` then typing `unpackPhase`, `buildPhase` works because the interactive shell sources stdenv's setup.

### Trace the closure

`nix why-depends` shows the path from one store object to another:

```sh
nix why-depends nixpkgs#hello nixpkgs#glibc.out
```

```text
/nix/store/5z2yp3ysx8476c8g5w25b0smlgkjvaq3-hello-2.12.3
└───/nix/store/h4wfwic161kxrr74jlzla5lsm28hgary-glibc-2.44-25
```

Note `glibc.out`: bare `nixpkgs#glibc` picks the `bin` output and reports "does not depend". `nix path-info -Sh` gives closure size (`hello`: 36.7 MiB). `nix-tree` (`nix run nixpkgs#nix-tree -- <path>`) is an interactive browser of the same graph.

### Check determinism

`nix build --rebuild` builds again and compares against the existing output. Silence means identical:

```text
checking outputs of '/nix/store/jwxdfb7n6iwn0bjyjcbhg283m1f04igk-greeting.drv'...
```

A difference means something impure (timestamps, random ordering) is in the build.

### Inspect the recipe

`nix derivation show <installable>` prints the `.drv` as JSON: `builder`, `args`, `env` or `structuredAttrs`, `inputs`. It shows what the builder actually received. See [The derivation primitive](/learn/derivation-primitive).

### The real docs are the source

Builder options are documented in the nixpkgs manual, but the behaviour is in the setup hooks. `nix eval --raw nixpkgs#<pkg>.meta.position` prints `file:line` of the package definition. The hooks live under `pkgs/build-support/` in the nixpkgs tree, for example `pkgs/build-support/node/fetch-pnpm-deps/default.nix`, where the `fetcherVersion` requirement is a plain `throw` you can read. If the printed path does not exist, run `nix flake prefetch nixpkgs` to materialise the tree.

## Try it

Two failing builds that look alike and are not. A missing tool:

```sh
nix build --impure --no-link -L --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in pkgs.runCommand "needs-jq" { } "jq --version > $out"'
```

```text
needs-jq> /build/.attr-0l2nkwhif96f51f4amnlf414lhl4rv9vh8iffyp431v6s28gsr90: line 1: jq: command not found
       Reason: builder failed with exit code 127.
```

Exit 127 is bash for "command not found": add `pkgs.jq` to `nativeBuildInputs`. A network attempt:

```sh
nix build --impure --no-link -L --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in pkgs.runCommand "net" { nativeBuildInputs = [ pkgs.curl ]; } "curl -sS https://example.com > $out"'
```

```text
net> curl: (6) Could not resolve host: example.com
       Reason: builder failed with exit code 6.
```

DNS fails inside the sandbox by design. The fix is a fixed-output fetcher, never `sandbox = false`.

## Exercise

Make the `needs-jq` build succeed, then use `nix why-depends` to confirm the result depends on `jq`.

<details>
<summary>Solution</summary>

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
pkgs.runCommand "needs-jq" { nativeBuildInputs = [ pkgs.jq ]; } ''
  jq --version > $out
''
```

```sh
nix build --impure --no-link --print-out-paths --expr '<expression>'
cat /nix/store/sqwgiq1vhvjy4sxbkrh98i8x2iz80mzl-needs-jq
nix why-depends /nix/store/sqwgiq1vhvjy4sxbkrh98i8x2iz80mzl-needs-jq nixpkgs#jq.bin
```

```text
jq-1.8.2
'/nix/store/sqwgiq1vhvjy4sxbkrh98i8x2iz80mzl-needs-jq' does not depend on 'flake:nixpkgs#jq.bin'
```

The build used jq, yet the result does not depend on it: the output contains only a version string, no store path. Build-time inputs and the run-time closure are different things. `nix derivation show` lists jq under `inputs`; `why-depends` follows only references embedded in the output. `jq.bin` is needed because `jq` has five outputs and `why-depends` wants exactly one store path.

</details>

## Trap

Setting `sandbox = false` or `--option sandbox false` to make a build pass. It passes on your machine because it found `/usr/bin/node` or reached the network, and fails on every other machine and in CI. Recognise the temptation by an error that mentions a host path or a hostname. The sandbox is telling you about a missing input. Declare it.

## Checkpoint

```quiz
[
  {"q": "Why does `nix log nixpkgs#hello` say the log is not available?", "options": ["hello has no log", "The path was substituted from the cache, never built locally", "Logs expire after a day", "nix log needs --impure"], "answer": 1, "why": "Build logs exist only for local builds; substituted paths come with no log."},
  {"q": "What does exit code 127 in a build log mean?", "options": ["Out of memory", "Network denied", "Command not found: a tool is missing from nativeBuildInputs", "Hash mismatch"], "answer": 2, "why": "127 is the shell's code for an unknown command."},
  {"q": "Where does `$out` point inside `nix develop` on a package?", "options": ["/nix/store", "A directory under your working directory (outputs/out)", "/tmp", "It is unset"], "answer": 1, "why": "nix develop rewrites output paths to local directories so phases can run without the daemon."}
]
```
