---
title: Per-system outputs
stage: 3
order: 18
slug: per-system-outputs
summary: Remove the x86_64-linux repetition with lib.genAttrs and judge when flake-utils or flake-parts is worth it.
minutes: 12
---

## Why this matters

Every flake so far hardcoded `x86_64-linux`. The moment you open the repo on a Mac or an ARM VPS, `nix develop` says the output does not exist. The fix is a one-line helper. Knowing it is a plain function also lets you read the many flakes that use `flake-utils` or `flake-parts` without treating them as magic.

## Concept

### The problem

```nix
{
  packages.x86_64-linux.default = "built for x86_64";
  packages.aarch64-linux.default = "built for aarch64";
  devShells.x86_64-linux.default = "shell for x86_64";
  devShells.aarch64-linux.default = "shell for aarch64";
}
```

Four attributes, two of each, and every new output doubles again. Nix cannot know your system at evaluation time in pure mode, so you must enumerate.

### `lib.genAttrs`

`lib.genAttrs names f` builds an attribute set with one key per name and `f name` as the value. Verified:

```sh
nix eval --impure --expr 'let pkgs = import (builtins.getFlake "nixpkgs") {}; systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ]; forAllSystems = pkgs.lib.genAttrs systems; in forAllSystems (system: "pkgs for ${system}")'
```

```text
{ aarch64-darwin = "pkgs for aarch64-darwin"; aarch64-linux = "pkgs for aarch64-linux"; x86_64-linux = "pkgs for x86_64-linux"; }
```

That is the whole trick. Applied to a flake:

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
    in
    {
      packages = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in { default = pkgs.hello; }
      );

      devShells = forAllSystems (system:
        let pkgs = nixpkgs.legacyPackages.${system};
        in { default = pkgs.mkShellNoCC { packages = [ pkgs.hello ]; }; }
      );
    };
}
```

Laziness means the `aarch64-darwin` branch is never evaluated on your machine unless something asks for it. No cost.

### `flake-utils`

`flake-utils.lib.eachDefaultSystem` inverts the nesting: you write `packages.default` once and it inserts the system level for you.

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.flake-utils.url = "github:numtide/flake-utils";

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = nixpkgs.legacyPackages.${system};
      in {
        packages.default = pkgs.hello;
        devShells.default = pkgs.mkShellNoCC { packages = [ pkgs.hello ]; };
      }
    );
}
```

Cost: one more input in the lock, and the "default systems" list lives in a third flake (`nix-systems/default`). Outputs that have no system level (`overlays`, `nixosConfigurations`, `templates`) must go outside the `eachDefaultSystem` call with `//`, which is where mistakes happen.

### `flake-parts`

`flake-parts` applies the NixOS module system to flakes: `perSystem = { pkgs, ... }: { ... }` plus `flake = { ... }` for system-independent outputs. Powerful when a flake grows modules, many packages and shared options. Overkill for one dev shell. You meet the module system in [The module system](/learn/module-system); come back to flake-parts after that.

### Recommendation

Use plain `genAttrs`. It is six lines, zero inputs, and every output stays where `nix flake show` expects it. Reach for `flake-parts` only when a flake becomes a project in itself.

## Try it

Write the `genAttrs` flake, `git add`, and run:

```sh
nix flake show
```

```text
git+file:///tmp/lx18-IqCq
├───devShells
│   ├───aarch64-darwin
│   │   └───default omitted (use '--all-systems' to show)
│   ├───aarch64-linux
│   │   └───default omitted (use '--all-systems' to show)
│   └───x86_64-linux
│       └───default: development environment 'nix-shell'
└───packages
    ├───aarch64-darwin
    │   └───default omitted (use '--all-systems' to show)
    ├───aarch64-linux
    │   └───default omitted (use '--all-systems' to show)
    └───x86_64-linux
        └───default: package 'hello-2.12.3'
```

"omitted" confirms laziness: nothing for other systems was evaluated. Then:

```sh
nix eval .#packages --apply builtins.attrNames
```

```text
[ "aarch64-darwin" "aarch64-linux" "x86_64-linux" ]
```

## Exercise

Refactor the repeated `let pkgs = nixpkgs.legacyPackages.${system};` into a helper so each output body receives `pkgs` directly: `packages = forAllPkgs (pkgs: { default = pkgs.hello; });`.

<details>
<summary>Solution</summary>

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
      forAllPkgs = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      packages = forAllPkgs (pkgs: { default = pkgs.hello; });
      devShells = forAllPkgs (pkgs: { default = pkgs.mkShellNoCC { packages = [ pkgs.hello ]; }; });
    };
}
```

`forAllPkgs` composes `genAttrs` with the lookup. Same output, less noise.

</details>

## Trap

Combining `eachDefaultSystem` with a system-independent output using `//`:

```nix
{
  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system: {
      packages.default = nixpkgs.legacyPackages.${system}.hello;
    }) // {
      overlays.default = final: prev: { };
    };
}
```

This one is correct. The trap is writing `packages.default = ...; overlays.default = ...;` **inside** the `eachDefaultSystem` body: you get `overlays.x86_64-linux.default`, and `nix flake check` fails with:

```text
error: overlay is not a function, but a set instead
```

Recognise it by an unexpected system name under `overlays` or `templates` in `nix flake show`. Remember `//` is shallow: it replaces whole top-level keys, see [Attribute sets](/learn/attrsets-let-with-inherit).

## Checkpoint

```quiz
[
  {"q": "What does `lib.genAttrs [ \"a\" \"b\" ] f` return?", "options": ["[ (f \"a\") (f \"b\") ]", "{ a = f \"a\"; b = f \"b\"; }", "f { a = 1; b = 2; }", "A list of names"], "answer": 1, "why": "genAttrs turns a list of names into an attribute set keyed by those names with f applied to each."},
  {"q": "Why does listing aarch64-darwin cost nothing on an x86_64-linux machine?", "options": ["Nix skips unknown systems", "Laziness: the attribute is never forced", "nixpkgs is empty for darwin", "genAttrs filters by current system"], "answer": 1, "why": "Attribute values are thunks; nix flake show prints 'omitted' instead of evaluating them."},
  {"q": "Which output must stay outside `eachDefaultSystem`?", "options": ["packages", "devShells", "overlays", "checks"], "answer": 2, "why": "overlays have no per-system level; eachDefaultSystem would insert one and break the schema."}
]
```
