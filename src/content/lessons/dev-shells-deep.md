---
title: Dev shells in depth
stage: 3
order: 17
slug: dev-shells-deep
summary: Build a complete SvelteKit + Turso dev shell with Node 22, pnpm, Biome and turso-cli, plus a CI variant.
minutes: 15
---

## Why this matters

This is the lesson that replaces `mise` for project tooling. One `flake.nix` per repo pins Node, pnpm, Biome and `turso` to exact versions for you, for CI, and for anyone who clones. [Dev shells](/learn/dev-shells) showed the shape; this one explains every knob.

## Concept

### `mkShell` is a derivation that is never built

`pkgs.mkShell` returns a derivation whose build phase fails on purpose. `nix develop` never builds it. It evaluates the derivation, collects its environment variables and dependencies, and drops you in a bash with that environment. Everything you know about derivation attributes applies.

### `mkShell` vs `mkShellNoCC`

`mkShell` uses `stdenv`, which includes a C compiler, `make` and binutils. `mkShellNoCC` uses `stdenvNoCC`. Verified:

```text
{ cc = "stdenv-linux"; nocc = "stdenv-linux-no-cc"; }
```

For a TypeScript project you do not want gcc on `PATH`. Use `mkShellNoCC`. Switch to `mkShell` only when a native npm module must compile (and then add `python3` too).

### `packages` vs `buildInputs` vs `nativeBuildInputs`

Verified by evaluation:

```text
{ buildInputs = [ "zlib-1.3.2" ]; name = "nix-shell"; nativeBuildInputs = [ "hello-2.12.3" "pkg-config-wrapper-0.29.2" ]; }
```

`packages` is merged into `nativeBuildInputs`. The distinction matters for cross-compilation only: `nativeBuildInputs` are tools that run on your machine, `buildInputs` are libraries for the target. In a shell on your own machine:

- Tools you type (`node`, `pnpm`, `biome`, `turso`) go in `packages`.
- Libraries a native module links against (`openssl`, `zlib`) go in `buildInputs` so `pkg-config` finds them.

### The full shell

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system} = {
        default = pkgs.mkShellNoCC {
          packages = [
            pkgs.nodejs_22
            pkgs.pnpm_10
            pkgs.biome
            pkgs.turso-cli
          ];

          env.TURSO_DATABASE_URL = "file:local.db";

          shellHook = ''
            export PATH="$PWD/node_modules/.bin:$PATH"
            echo "node $(node --version), pnpm $(pnpm --version)"
          '';
        };

        ci = pkgs.mkShellNoCC {
          packages = [ pkgs.nodejs_22 pkgs.pnpm_10 ];
          env.CI = "true";
        };
      };
    };
}
```

- `env.X = "value"` sets a plain environment variable. Values may be strings, booleans, integers or derivations; a list is rejected at evaluation time.
- `shellHook` is bash run after the environment is set up. Keep it fast; it runs on every `cd` with direnv.
- `devShells.<system>.ci` is a second shell: `nix develop .#ci`. Multiple shells are just multiple attributes.

### Why `pnpm_10`, not `pnpm`

In the current nixpkgs `pnpm` is 12.x. Match the `packageManager` field in your `package.json`. Verify what you get:

```sh
nix eval nixpkgs#pnpm.version
nix eval nixpkgs#pnpm_10.version
```

```text
"12.3.4"
"10.34.5"
```

### Playwright

Playwright downloads browsers into `~/.cache/ms-playwright`, which breaks on NixOS and works on Arch. nixpkgs offers `pkgs.playwright-driver.browsers` as a prebuilt set. The npm `playwright` version must match `pkgs.playwright-driver.version` exactly (currently `1.63.0`). Verify: `nix eval nixpkgs#playwright-driver.version`. On Arch, let Playwright manage its own browsers and leave this out of the shell.

## Try it

Write the flake above into a project, `git add flake.nix`, then inspect without downloading Node:

```sh
nix flake show
```

```text
git+file:///tmp/lx17-gry2
└───devShells
    └───x86_64-linux
        ├───ci: development environment 'nix-shell'
        └───default: development environment 'nix-shell'
```

```sh
nix eval .#devShells.x86_64-linux.default.nativeBuildInputs --apply 'map (p: p.name)'
```

```text
[ "nodejs-22.23.3" "pnpm-10.34.5" "biome-2.5.14" "turso-cli-1.0.32" ]
```

```sh
nix derivation show .#devShells.x86_64-linux.default | jq '.derivations[] | .env | {TURSO_DATABASE_URL, shellHook}'
```

```text
{
  "TURSO_DATABASE_URL": "file:local.db",
  "shellHook": "export PATH=\"$PWD/node_modules/.bin:$PATH\"\necho \"node $(node --version), pnpm $(pnpm --version)\"\n"
}
```

`nix develop` would now fetch about 100 MB (Node is large). Do it when you are ready.

## Exercise

Add a third shell `db` that contains only `turso-cli` and `sqlite`, and sets `TURSO_DATABASE_URL` to `file:dev.db`. Confirm with `nix flake show` that three shells exist.

<details>
<summary>Solution</summary>

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      devShells.${system}.db = pkgs.mkShellNoCC {
        packages = [ pkgs.turso-cli pkgs.sqlite ];
        env.TURSO_DATABASE_URL = "file:dev.db";
      };
    };
}
```

Merge the `db` attribute into the existing `devShells.${system}` set. `nix develop .#db` enters it.

</details>

## Trap

Putting `pkgs.openssl` in `packages` and expecting a native module to link. `packages` becomes `nativeBuildInputs`; the setup hooks that export library search paths (`pkg-config`, `NIX_LDFLAGS`) only run for `buildInputs`. Recognise it by `pkg-config` saying the library is not found while the binary is clearly on `PATH`. Fix: move libraries to `buildInputs`, keep `pkg-config` in `packages`.

## Checkpoint

```quiz
[
  {"q": "What does `nix develop` do with the mkShell derivation?", "options": ["Builds it and runs the result", "Evaluates it and loads its environment without building", "Copies it to the profile", "Runs its checkPhase"], "answer": 1, "why": "mkShell's build phase fails on purpose; nix develop only needs the evaluated environment."},
  {"q": "Where does `packages = [ pkgs.nodejs_22 ]` end up?", "options": ["buildInputs", "nativeBuildInputs", "propagatedBuildInputs", "shellHook"], "answer": 1, "why": "mkShell merges packages into nativeBuildInputs, the list of tools that run on the build machine."},
  {"q": "Why prefer mkShellNoCC for a SvelteKit project?", "options": ["It is faster to evaluate", "It avoids pulling gcc, make and binutils into the shell", "It supports pnpm", "mkShell is deprecated"], "answer": 1, "why": "stdenvNoCC omits the C toolchain, which a pure TypeScript project does not need."}
]
```
