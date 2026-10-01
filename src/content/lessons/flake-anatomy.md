---
title: Flake anatomy
stage: 3
order: 14
slug: flake-anatomy
summary: Read any flake.nix and name its four parts, and explain why flakes replaced channels.
minutes: 12
---

## Why this matters

Every Nix project you will touch from here on is a flake: your dev shells, your dotfiles later with Home Manager, a VPS config. A flake is a small contract. Once you can read the contract, `nix develop`, `nix build` and `nix run` stop being magic. You already use the same idea daily: `package.json` plus `pnpm-lock.yaml`.

## Concept

### The problem flakes solve

Before flakes, `import <nixpkgs>` meant "whatever channel this machine happens to have". Two machines, two results. That is the opposite of reproducible.

A flake fixes this with **hermetic evaluation**: the only inputs are the files in the flake and the inputs declared in `flake.nix`, each pinned to an exact revision in `flake.lock`. No `$NIX_PATH`, no channels, no environment leakage.

### The four parts

```nix
{
  description = "My first flake";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
    in
    {
      packages.x86_64-linux.default = pkgs.hello;
    };
}
```

A `flake.nix` is one attribute set with these keys:

- `description` — optional string.
- `inputs` — other flakes this one depends on. Covered in [Inputs and the lock file](/learn/inputs-and-lock).
- `outputs` — a **function**. Nix calls it with the resolved inputs and expects an attribute set back.
- `nixConfig` — rare; per-flake Nix settings.

Nothing else is allowed at the top level.

### `self`

The first argument to `outputs` is `self`: the flake itself, after evaluation. It gives you `self.packages`, `self.outPath` (the source in the store) and `self.rev` when the git tree is clean. You use it to reference your own outputs without repeating yourself. It is a **fixpoint**: `outputs` receives the result of calling `outputs`. Laziness makes that legal, see [Laziness and recursion](/learn/laziness-and-recursion).

### `nixpkgs.legacyPackages`

`nixpkgs` as an input is a flake too. Its package set lives under `legacyPackages.<system>`. The name is historical; it is not deprecated. The flake also exposes `nixpkgs.lib`.

### The lock file

The first time you run any flake command, Nix resolves `nixos-unstable` to a commit and writes `flake.lock`. From then on every evaluation uses that commit until you update. Commit the lock file. It is your `pnpm-lock.yaml`.

### Flakes see only tracked files

A flake inside a git repository is copied to the store before evaluation. Only files git knows about are copied. A new untracked file is invisible. Directories that are not git repositories are copied whole.

### Experimental status

`nix flake` still prints "This program is experimental". The feature has been stable in practice since 2021 and is what nixpkgs, Home Manager and most of the community ship. The flag you already have in `nix.conf` is all you need.

## Try it

Create the flake above in a fresh directory and inspect it.

```sh
mkdir /tmp/first-flake && cd /tmp/first-flake
# write flake.nix from the Concept section
git init && git add .
nix flake show
```

First run resolves and downloads nixpkgs (slow line: wait). Real output:

```text
warning: creating lock file "/tmp/lx14-3eL8/flake.lock":
• Added input 'nixpkgs':
    'github:NixOS/nixpkgs/b4fd65b198c599cbe814fcb9f42d25d021595ec9?narHash=sha256-ilerN1WLSvF%2BHMjziC/Wv99J5y02maDH%2B6hZPwsORKg%3D' (2026-09-29)
git+file:///tmp/lx14-3eL8
└───packages
    └───x86_64-linux
        └───default: package 'hello-2.12.3'
```

Now the metadata:

```sh
nix flake metadata
```

```text
warning: Git tree '/tmp/lx14-3eL8' is dirty
Resolved URL:  git+file:///tmp/lx14-3eL8
Description:   My first flake
Path:          /nix/store/dx16sjabd72bslsdil9g8nawds35xwwf-source
Last modified: 1970-01-01 03:00:00
Fingerprint:   29b308c2daf9be7be1a05f57d1aff00967cea265cd6212eaa5855eb6616ea2ba
Inputs:
└───nixpkgs: github:NixOS/nixpkgs/b4fd65b198c599cbe814fcb9f42d25d021595ec9?narHash=sha256-ilerN1WLSvF%2BHMjziC/Wv99J5y02maDH%2B6hZPwsORKg%3D (2026-09-29 13:38:46)
```

`Path` is the copy in the store. `dirty` and the 1970 date mean the tree has uncommitted changes. Commit and both go away.

## Exercise

Add a second output `packages.x86_64-linux.greet` that is `pkgs.hello` too, and reference it from a new output `apps.x86_64-linux.default` using `self` instead of `pkgs`. Verify with `nix flake show`.

<details>
<summary>Solution</summary>

```nix
{
  description = "My first flake";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
    in
    {
      packages.x86_64-linux.default = pkgs.hello;
      packages.x86_64-linux.greet = pkgs.hello;

      apps.x86_64-linux.default = {
        type = "app";
        program = "${self.packages.x86_64-linux.greet}/bin/hello";
      };
    };
}
```

`self.packages.x86_64-linux.greet` works because `self` is the evaluated flake. `nix flake show` lists `apps` and `packages`.

</details>

## Trap

You edit `flake.nix` in a git repo, add a new file `shell.nix` next to it, reference it, and get:

```text
error: Path 'shell.nix' in the repository "/tmp/lxB-3lRk" is not tracked by Git.

       To make it visible to Nix, run:

       git -C "/tmp/lxB-3lRk" add -N "shell.nix"
```

Nix is not lying. It copied only tracked files. `git add` the file (intent-to-add `-N` is enough). This bites hardest when a `.gitignore` rule hides a file you need.

## Checkpoint

```quiz
[
  {"q": "What type is the value of the `outputs` attribute in flake.nix?", "options": ["An attribute set", "A list of derivations", "A function from inputs to an attribute set", "A string path"], "answer": 2, "why": "Nix calls outputs with the resolved inputs (plus self) and expects an attribute set back."},
  {"q": "Why can a flake reference its own outputs through `self`?", "options": ["Nix evaluates outputs twice", "Lazy evaluation makes the fixpoint legal", "self is a copy of nixpkgs", "self is a string URL"], "answer": 1, "why": "outputs receives its own result; laziness means attributes are only forced when needed, so the recursion terminates."},
  {"q": "Why does a freshly created file next to flake.nix cause 'not tracked by Git'?", "options": ["Flakes require a remote", "Nix copies only git-tracked files to the store before evaluating", "The file has wrong permissions", "Nix caches the old tree"], "answer": 1, "why": "Hermetic evaluation copies the tracked tree to the store, so untracked files do not exist as far as Nix is concerned."}
]
```
