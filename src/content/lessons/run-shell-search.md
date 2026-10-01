---
title: Run, shell, search
stage: 1
order: 4
slug: run-shell-search
summary: Run any of 28000+ packages without installing it, open a temporary shell with tools, and find package names.
minutes: 12
---

## Why this matters

This is the daily-driver Nix. Need `ripgrep` on a machine for ten minutes, or want to try a CLI without polluting pacman: one command, no install, nothing left behind except cache. It replaces `npx`, `pipx run`, and `docker run --rm` for most one-off tool use.

## Concept

### Installables and the `nixpkgs#` syntax

Every new-style `nix` command takes an **installable**: `<flake>#<attribute>`. `nixpkgs#hello` means "the attribute `hello` in the flake named `nixpkgs`".

Where does the name `nixpkgs` come from? The **flake registry**, a lookup table from short names to URLs:

```sh
nix registry list | grep 'flake:nixpkgs '
```

```text
global flake:nixpkgs https://channels.nixos.org/nixpkgs-unstable/nixexprs.tar.zst
```

So `nixpkgs#hello` is really `https://channels.nixos.org/nixpkgs-unstable/nixexprs.tar.zst#hello`. The registry has 46 global entries. You can add your own with `nix registry add`, or pin `nixpkgs` to a commit with `nix registry pin`. Both write to `~/.config/nix/registry.json`.

The attribute path is resolved against the flake's outputs. For nixpkgs, `hello` is shorthand for `legacyPackages.x86_64-linux.hello`. You will see the long form in search results.

### `nix run`: execute once

```sh
nix run nixpkgs#hello
```

```text
Hello, world!
```

Nix evaluates the attribute, downloads the closure from `cache.nixos.org` (or builds it), runs `bin/hello`, exits. Nothing is added to your PATH or profile. The closure stays in the store until GC.

Arguments go after `--`:

```sh
nix run nixpkgs#hello -- --greeting "hi dave"
```

```text
hi dave
```

Which binary runs? `meta.mainProgram` if set, otherwise a binary matching the package name.

### `nix shell`: a temporary PATH

```sh
nix shell nixpkgs#ripgrep
```

Drops you into a subshell where `rg` is on PATH. Your fish config, cwd and env are untouched. Type `exit` to leave. For a one-liner, use `-c`:

```sh
nix shell nixpkgs#ripgrep -c sh -c 'command -v rg'
```

```text
/nix/store/vli6118fdbngwy46j1w741ansmrzfszr-ripgrep-15.2.0/bin/rg
```

The binary lives in the store, not in `/usr/bin`. Several packages at once: `nix shell nixpkgs#ripgrep nixpkgs#fd nixpkgs#jq`.

`nix shell` is for using tools. `nix develop` (next lesson, [Dev shells](/learn/dev-shells)) is for building projects: it also sets up compilers, headers and environment variables.

### `nix search`: finding names

```sh
nix search nixpkgs ripgrep
```

```text
* legacyPackages.x86_64-linux.bat-extras.batgrep (2024.08.24-unstable-2025-02-22)
  Quickly search through and highlight files using ripgrep

* legacyPackages.x86_64-linux.grip-grab (0.6.7)
  Fast, more lightweight ripgrep alternative for daily use cases

* legacyPackages.x86_64-linux.repgrep (0.17.1)
  Interactive replacer for ripgrep that makes it easy to find and replace across files on the command line

* legacyPackages.x86_64-linux.ripgrep (15.2.0)
  Utility that combines the usability of The Silver Searcher with the raw speed of grep
```

The search term is a regex matched against name and description. Anchor the end to cut noise: `nix search nixpkgs 'ripgrep$'`. Exclude with `-e`: `nix search nixpkgs grep -e bat`. Machine-readable: `--json`.

The first search evaluates all of nixpkgs and caches the result in `~/.cache/nix/`. It takes a while. Later searches are fast.

For a name you already suspect, skip search and check directly:

```sh
nix eval nixpkgs#turso-cli.version
```

```text
"1.0.31"
```

### Where the files come from

Nothing is compiled on your machine for common packages. `cache.nixos.org` is a **substituter**: Nix asks it "do you have this store path?" and downloads the prebuilt closure. Your `nix config show` lists it as the only substituter. If a path is not in the cache, Nix builds it locally.

## Try it

Run a tool you do not have, with arguments.

```sh
nix run nixpkgs#ripgrep -- --version
```

```text
ripgrep 15.2.0

features:+pcre2
simd(compile):+SSE2,-SSSE3,-AVX2
simd(runtime):+SSE2,+SSSE3,+AVX2

PCRE2 10.45 is available (JIT is available)
```

Then look up the exact attribute for Biome and its version:

```sh
nix eval nixpkgs#biome.version
```

```text
"2.5.14"
```

## Exercise

Find the nixpkgs attribute for Node.js 22 (not 24), confirm its exact version, and run `node --version` through it without installing anything.

<details>
<summary>Solution</summary>

```sh
nix search nixpkgs 'nodejs_2' 2>/dev/null | grep '^\*'
```

```text
* legacyPackages.x86_64-linux.nodejs_22 (22.23.3)
* legacyPackages.x86_64-linux.nodejs_24 (24.21.0)
* legacyPackages.x86_64-linux.nodejs_26 (26.10.0)
```

```sh
nix eval nixpkgs#nodejs_22.version
nix run nixpkgs#nodejs_22 -- --version
```

```text
"22.23.3"
v22.23.3
```

Note `^nodejs_` finds nothing: the regex runs against the full attribute path `legacyPackages.x86_64-linux.nodejs_22`, so anchoring to the start fails.

`nixpkgs#nodejs` with no suffix is the current default, 24.21.0 at this nixpkgs revision. Pin the suffixed attribute in projects. The first `nix run` downloads the Node closure; on your line expect a minute or two.

</details>

## Trap

fish and `#`. In fish, `#` starts a comment only at the start of a word, so `nix run nixpkgs#hello` is safe. But a space before it, `nix run nixpkgs #hello`, makes `#hello` a comment and the command silently becomes `nix run nixpkgs`. Keep `flake#attr` as one unbroken token.

## Checkpoint

```quiz
[
  {"q": "What does the registry do for nixpkgs#hello?", "options": ["Caches the hello binary", "Maps the short name nixpkgs to a flake URL", "Searches package descriptions", "Pins hello to a version"], "answer": 1, "why": "The registry is a name-to-URL table; nixpkgs resolves to the nixpkgs-unstable channel tarball."},
  {"q": "After nix run nixpkgs#hello exits, where is hello?", "options": ["In ~/.nix-profile/bin", "In /usr/local/bin", "In /nix/store only, until garbage collected", "Deleted immediately"], "answer": 2, "why": "nix run never touches a profile or PATH; the closure simply stays cached in the store."},
  {"q": "What is the difference between nix shell and nix develop?", "options": ["None, they are aliases", "nix shell puts binaries on PATH; nix develop sets up a full build environment for a project", "nix shell installs permanently", "nix develop only works on NixOS"], "answer": 1, "why": "nix shell is for using tools; nix develop loads a derivation's build inputs and hooks for working on source."}
]
```
