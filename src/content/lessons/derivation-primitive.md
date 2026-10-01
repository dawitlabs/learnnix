---
title: The derivation primitive
stage: 4
order: 21
slug: derivation-primitive
summary: Build a derivation by hand with builtins.derivation and read its .drv to see exactly what Nix records.
minutes: 14
---

## Why this matters

Everything Nix builds, from `hello` to a NixOS system, bottoms out in one primitive: `builtins.derivation`. `stdenv.mkDerivation`, `buildNpmPackage` and `mkShell` are Nix functions that end up calling it. If you can read a raw derivation you can read any build, and the error messages in [Debugging builds](/learn/debugging-builds) stop being opaque.

## Concept

### A derivation is a build recipe, not a build

`builtins.derivation` takes an attribute set and returns a **derivation**: a plan with a fixed output path, serialised to a `.drv` file in the store. Evaluating it does not run anything. `nix build` realises it: runs the builder in a sandbox and checks the output landed at the promised path.

Required attributes:

- `name` — becomes part of the store path.
- `system` — `x86_64-linux`; a mismatch means "cannot build on this machine".
- `builder` — path to an executable. Nix runs exactly this, nothing else.
- `args` — optional list of arguments for the builder.

Every other attribute becomes an **environment variable** for the builder. Nix adds `out`, the output path, and sets no `PATH`.

### The smallest useful derivation

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
builtins.derivation {
  name = "greeting";
  system = "x86_64-linux";
  builder = "${pkgs.bash}/bin/bash";
  args = [ "-c" "echo hello from nix > $out" ];
}
```

`${pkgs.bash}` interpolates to the store path of bash. That reference is recorded as an **input derivation**: Nix builds or fetches bash before running this. `$out` inside the string is a shell variable, expanded by bash at build time, not by Nix.

### What Nix records

```sh
nix derivation show --impure --expr '<the expression above>' | jq '.derivations[]'
```

Real output (trimmed to the interesting keys):

```text
{
  "name": "greeting",
  "system": "x86_64-linux",
  "builder": "/nix/store/1mv3qz005gkbalxfghk4y3s8ayv4d2dl-bash-interactive-5.3p15/bin/bash",
  "args": [
    "-c",
    "echo hello from nix > $out"
  ],
  "env": {
    "builder": "/nix/store/1mv3qz005gkbalxfghk4y3s8ayv4d2dl-bash-interactive-5.3p15/bin/bash",
    "name": "greeting",
    "out": "/nix/store/kzr96mc5b43fpbvrw6i0mixadz03xi51-greeting",
    "system": "x86_64-linux"
  },
  "outputs": {
    "out": {
      "path": "kzr96mc5b43fpbvrw6i0mixadz03xi51-greeting"
    }
  }
}
```

Read `env`: four variables. No `PATH`, no `HOME`. The output path is already decided before anything runs, computed as a hash of this whole recipe. Change one character of `args` and the path changes. That is why Nix never needs to ask "is this stale".

### The sandbox

Your `nix.conf` has `sandbox = true`. The builder sees only its declared inputs, `/build` as a working directory, no network, no `/usr/bin`. A build that works here works on any machine with the same inputs. Fetching from the network is allowed only for fixed-output derivations, see [Fetchers and hashes](/learn/fetchers-and-hashes).

### `runCommand`: the same thing with stdenv

`pkgs.runCommand name attrs script` is `builtins.derivation` with bash, coreutils and the stdenv setup on `PATH`. Use it for glue; use raw `builtins.derivation` only to learn.

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
pkgs.runCommand "greeting-dir" { } ''
  mkdir -p $out
  echo hi > $out/hello.txt
''
```

## Try it

Build the raw derivation (first run fetches bash and glibc from the cache):

```sh
nix build --impure --no-link --print-out-paths --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in builtins.derivation { name = "greeting"; system = "x86_64-linux"; builder = "${pkgs.bash}/bin/bash"; args = [ "-c" "echo hello from nix > $out" ]; }'
```

```text
/nix/store/kzr96mc5b43fpbvrw6i0mixadz03xi51-greeting
```

```sh
cat /nix/store/kzr96mc5b43fpbvrw6i0mixadz03xi51-greeting
```

```text
hello from nix
```

The output is a **file**, not a directory. `$out` is whatever the builder makes it. Run the build again: nothing happens, the path already exists.

## Exercise

Write a raw derivation named `two-files` whose output is a directory containing `a.txt` and `b.txt`. Build it. The first attempt will probably fail; read the error before looking at the solution.

<details>
<summary>Solution</summary>

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
builtins.derivation {
  name = "two-files";
  system = "x86_64-linux";
  builder = "${pkgs.bash}/bin/bash";
  PATH = "${pkgs.coreutils}/bin";
  args = [ "-c" "mkdir $out; echo one > $out/a.txt; echo two > $out/b.txt" ];
}
```

Without the `PATH` line the build fails:

```text
       Reason: builder failed with exit code 1.
       > bash: line 1: mkdir: command not found
```

`echo` is a bash builtin so it worked in the first example. `mkdir` is a program, and the sandbox has no `PATH`. Any attribute becomes an environment variable, so `PATH = "${pkgs.coreutils}/bin"` fixes it. The built output:

```text
/nix/store/rf6iqapmy85ba12qd07j8jnfamgsvqya-two-files
a.txt
b.txt
```

</details>

## Trap

Writing to the current directory instead of `$out`. The builder exits 0, then Nix fails:

```text
error: builder for '/nix/store/apj18snvcmbfsh16h1q2wh870wnyc7nh-forgot-out.drv' failed to produce output path for output 'out' at "/nix/store/apj18snvcmbfsh16h1q2wh870wnyc7nh-forgot-out.drv.chroot/root/nix/store/gjfd2529x2i9z9y6r711wjmz752a0pl8-forgot-out"
```

The working directory is scratch space deleted after the build. Only `$out` survives. Recognise it by a build whose log looks fine and still ends in "failed to produce output path".

## Checkpoint

```quiz
[
  {"q": "What happens when Nix evaluates `builtins.derivation { ... }`?", "options": ["The builder runs immediately", "A .drv recipe is written and an output path is computed; nothing runs", "The output is fetched from the cache", "Nothing until nix flake check"], "answer": 1, "why": "Evaluation produces the recipe; realisation (nix build) runs the builder."},
  {"q": "Why did `mkdir` fail inside a raw derivation while `echo` worked?", "options": ["mkdir is not sandbox-safe", "echo is a bash builtin; mkdir is a program and no PATH is set", "The output was read-only", "coreutils was not downloaded"], "answer": 1, "why": "Nix sets only name, system, builder, out and your attributes; PATH is empty unless you add it."},
  {"q": "What does `$out` refer to in the builder's args?", "options": ["A Nix string interpolation", "A shell variable set by Nix to the predetermined output path", "The current directory", "The .drv file"], "answer": 1, "why": "Nix exports out as an environment variable; bash expands $out when the command runs."}
]
```
