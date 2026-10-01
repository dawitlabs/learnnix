---
title: Dev shells
stage: 1
order: 5
slug: dev-shells
summary: Write a flake.nix that pins Node, pnpm and Biome for a SvelteKit project and enter it with nix develop.
minutes: 20
---

## Why this matters

This replaces `.tool-versions` and `mise install` per project. The difference: mise pins "node 22", a flake pins the exact nixpkgs commit, so `node`, `pnpm`, `biome`, and their libc are byte-identical on your laptop, CI and a teammate's machine. One file, committed, no global state.

## Concept

### What a flake is

A `flake.nix` is an attrset with `inputs` (other flakes, pinned in `flake.lock`) and `outputs` (a function from the resolved inputs to an attrset of things Nix knows how to use: `packages`, `devShells`, `nixosModules`, and so on).

`nix flake init` writes a starter:

```sh
mkdir demo && cd demo && nix flake init
```

```text
wrote: "/tmp/demo/flake.nix"
```

The template defines `packages`. You want `devShells`, so write your own instead.

### A dev shell for SvelteKit

```nix
{
  description = "SvelteKit dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          pkgs.nodejs_22
          pkgs.pnpm
          pkgs.biome
        ];

        shellHook = ''
          echo "node $(node --version) | pnpm $(pnpm --version)"
        '';
      };
    };
}
```

Line by line:

- `inputs.nixpkgs.url` names where packages come from. Flake inputs are pinned, unlike the registry's `nixpkgs#` which floats.
- `outputs` is a function. `self` is this flake; `nixpkgs` is the fetched input. Attrset pattern, as in [Functions](/learn/functions).
- `pkgs = nixpkgs.legacyPackages.${system}` gives the package set for your CPU. Flakes do not guess the system; you say it.
- `mkShell` builds a derivation whose only purpose is its environment. `packages` go on PATH. `shellHook` is bash that runs on entry.
- `devShells.<system>.default` is the attribute `nix develop` looks for with no arguments.

Add `pkgs.turso-cli` to `packages` for a Turso project. Attribute names: see [Run, shell, search](/learn/run-shell-search).

### The git rule

Flakes only see files tracked by git. Untracked `flake.nix` in a git repo:

```sh
git init && nix flake show
```

```text
error: Path 'flake.nix' in the repository "/tmp/app" is not tracked by Git.

       To make it visible to Nix, run:

       git -C "/tmp/app" add -N "flake.nix"
```

The fix is in the message. The rule exists because Nix copies the source tree into the store, and "tracked by git" is the definition of "part of the project". It also means `.gitignore`d files are invisible to builds. A directory that is not a git repo at all works fine; the rule only applies inside repos.

### First entry

```sh
git add flake.nix
nix develop
```

The first run fetches nixpkgs metadata, writes `flake.lock`, downloads the three closures (Node is the big one, allow a few minutes on your line), and drops you into bash with the hook output:

```text
node v22.23.3 | pnpm 12.3.4
```

Inside, `PATH` starts with the store paths:

```sh
nix develop -c sh -c 'echo $PATH' | tr ':' '\n' | head -3
```

```text
/nix/store/qshvhyv92g772jjsm2zrgzxc4ai4iqfx-nodejs-22.23.3/bin
/nix/store/vlics4j96033dphx4kdfax0y2wjc84gm-pnpm-12.3.4/bin
/nix/store/90ac0im8imxwzn0cnmxr7gqhy1fzmnk4-biome-2.5.14/bin
```

`-c` runs one command instead of an interactive shell. `nix develop -c pnpm install` is how CI uses it.

`nix develop` starts bash, not fish, because `shellHook` is bash and the environment is set up by bash. For fish inside: `nix develop -c fish`. [direnv](/learn/direnv-workflow) removes this problem entirely.

### `flake.lock`

Generated on first use. Pins `nixpkgs` to a commit:

```text
"rev": "b6c8664de9b6cc07fe5666a29f91884ba81197c4"
```

Commit it. It is the `pnpm-lock.yaml` of your toolchain. Nix 2.35 stages it automatically with `git add -N`; `git status` shows ` A flake.lock`. Until you commit, every command warns `Git tree is dirty`. Harmless.

Update to current nixpkgs: `nix flake update`. Inspect: `nix flake metadata`. Validate without entering: `nix flake check`:

```text
checking derivation devShells.x86_64-linux.default...
all checks passed!
```

### Replacing mise

Keep both for now. The mental model: mise is per-user and global in scope, with per-directory overrides. A dev shell is per-project only and does nothing outside `nix develop`. Once a project has a flake, delete its `.tool-versions` or `mise.toml`. Leave mise managing tools you use everywhere until you cover those with a profile or home-manager.

## Try it

Create the flake above in a fresh directory, enter it once with `-c`, and confirm the versions. Expect downloads.

```sh
nix develop -c sh -c 'node --version; pnpm --version; biome --version'
```

```text
node v22.23.3 | pnpm 12.3.4
v22.23.3
12.3.4
Version: 2.5.14
```

The first line is the `shellHook`; it runs even with `-c`.

## Exercise

Add an environment variable `DATABASE_URL=file:local.db` to the shell so `echo $DATABASE_URL` works inside `nix develop`, without using `shellHook`.

<details>
<summary>Solution</summary>

`mkShell` passes unknown attributes through as environment variables:

```nix
{
  description = "SvelteKit dev shell";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.default = pkgs.mkShell {
        packages = [ pkgs.nodejs_22 pkgs.pnpm pkgs.biome ];
        DATABASE_URL = "file:local.db";
      };
    };
}
```

```sh
nix develop -c sh -c 'echo $DATABASE_URL'
```

```text
file:local.db
```

Any `NAME = "string";` attribute becomes `$NAME`. This is how `mkShell` and `mkDerivation` both work.

</details>

## Trap

Editing `flake.nix` to `import ./shell.nix`, creating the file, running `nix develop`, and getting:

```text
error: Path 'shell.nix' in the repository "/tmp/app" is not tracked by Git.
```

Nix 2.35 names the file. Older versions said `path '/nix/store/...-source/shell.nix' does not exist`, with a store path instead of your repo path; that is the same problem in disguise. Either way: `git add shell.nix` and retry. Every new file a flake touches needs `git add` before Nix can see it.

## Checkpoint

```quiz
[
  {"q": "Which attribute does nix develop use by default?", "options": ["packages.<system>.default", "devShells.<system>.default", "shell", "outputs.default"], "answer": 1, "why": "nix develop with no installable looks for devShells.<system>.default in the current flake."},
  {"q": "Why does nix flake show fail on an untracked flake.nix inside a git repo?", "options": ["Flakes require a commit", "Nix only sees git-tracked files when copying the source into the store", "The lock file is missing", "git must be installed via Nix"], "answer": 1, "why": "Inside a repo, tracked-by-git defines the project tree; untracked files are not copied and so do not exist to Nix."},
  {"q": "What pins the exact nixpkgs commit for a dev shell?", "options": ["The registry", "flake.lock", "nix.conf", "mise.toml"], "answer": 1, "why": "flake.lock records the resolved rev and hash of each input, so every machine evaluates the same nixpkgs."}
]
```
