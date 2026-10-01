---
title: Overlays
stage: 4
order: 25
slug: overlays
summary: Change a package for every consumer in a nixpkgs instance with a final: prev: overlay and export it from a flake.
minutes: 13
---

## Why this matters

`overrideAttrs` fixes one package where you reference it. An overlay fixes it **everywhere**: every other package that depends on it, your dev shell, your Home Manager config, all see the patched version. This is how you carry a local fix for a nixpkgs bug until upstream merges it, and how a flake shares custom packages with other flakes.

## Concept

### The signature

```nix
final: prev: {
  hello = prev.hello.overrideAttrs (old: {
    pname = "hello-patched";
  });
}
```

An overlay is a function of two arguments returning an attribute set of changes:

- `prev` — the package set **before** this overlay. Use it for the thing you are modifying, so you start from the original.
- `final` — the package set **after all overlays**. Use it for dependencies, so they pick up everyone else's changes too.

Older code names them `self: super:`. Same thing.

### Why laziness makes it work

`import nixpkgs { overlays = [ a b ]; }` builds the fixpoint: `final` is the result of applying all overlays, and each overlay receives that result while it is still being computed. This only terminates because attribute values are lazy: `final.hello` is a thunk until something forces it. Verified with two overlays where the first references `final.hello` and the second changes `hello`:

```sh
nix eval --impure --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { overlays = [ (final: prev: { greet = "greets with ${final.hello.name}"; }) (final: prev: { hello = prev.hello.overrideAttrs (o: { pname = "hello-loud"; }); }) ]; }; in pkgs.greet'
```

```text
"greets with hello-loud-2.12.3"
```

The first overlay saw a change made by the second. With `prev.hello.name` it would have said `hello-2.12.3`. This is the same fixpoint idea as `self` in a flake and `finalAttrs` in [override and overrideAttrs](/learn/override-and-overrideattrs).

### Applying an overlay

Two places. In a plain import:

```nix
let
  nixpkgs = builtins.getFlake "nixpkgs";
  pkgs = import nixpkgs {
    system = "x86_64-linux";
    overlays = [
      (final: prev: { hello = prev.hello.overrideAttrs (o: { pname = "hello-loud"; }); })
    ];
  };
in
pkgs.hello.name
```

```text
"hello-loud-2.12.3"
```

In NixOS or Home Manager modules, `nixpkgs.overlays = [ ... ];` does the same for the system's package set. You meet that in [Home Manager install](/learn/home-manager-install).

`nixpkgs.legacyPackages.${system}` is **pre-instantiated without overlays**. To apply overlays in a flake you must `import nixpkgs { ... }` yourself.

### Exporting from a flake

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ self.overlays.default ];
      };
    in
    {
      overlays.default = final: prev: {
        hello = prev.hello.overrideAttrs (old: {
          pname = "hello-loud";
          postInstall = (old.postInstall or "") + ''
            echo "built by my overlay" > $out/NOTE
          '';
        });
      };

      packages.${system}.default = pkgs.hello;
    };
}
```

`overlays.default` is the conventional name. Another flake adds `inputs.mine.url = ...` and `overlays = [ mine.overlays.default ]`. The flake uses its own overlay through `self`, so `packages` and the exported overlay cannot drift apart.

### Adding packages, not only changing them

An overlay can introduce new attributes: `final: prev: { my-tool = final.callPackage ./my-tool.nix { }; }`. `callPackage` fills the function's arguments from `final`, which is why packages in nixpkgs are written as functions of their dependencies.

## Try it

Write the flake above, `git add`, and inspect:

```sh
nix flake show
```

```text
git+file:///tmp/lx25-ynXn
├───overlays
│   └───default: Nixpkgs overlay
└───packages
    └───x86_64-linux
        └───default: package 'hello-loud-2.12.3'
```

```sh
nix flake check --no-build
```

```text
checking overlay 'overlays.default'...
checking flake output 'packages'...
checking derivation packages.x86_64-linux.default...
derivation evaluated to /nix/store/symaw8k1az9i0zbnzxr2d2lzplabvcs1-hello-loud-2.12.3.drv
all checks passed!
```

`nix flake check` validates that the overlay is a function of two arguments.

## Exercise

Extend the overlay so it also adds a new package `greet` built with `final.writeShellScriptBin "greet" "exec ${final.hello}/bin/hello"`, and expose it as `packages.x86_64-linux.greet`. Confirm with `nix flake show` that `greet` appears and that evaluating `.#packages.x86_64-linux.greet` succeeds.

<details>
<summary>Solution</summary>

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs {
        inherit system;
        overlays = [ self.overlays.default ];
      };
    in
    {
      overlays.default = final: prev: {
        hello = prev.hello.overrideAttrs (old: { pname = "hello-loud"; });
        greet = final.writeShellScriptBin "greet" ''
          exec ${final.hello}/bin/hello
        '';
      };

      packages.${system} = {
        default = pkgs.hello;
        greet = pkgs.greet;
      };
    };
}
```

`greet` references `final.hello`, so it wraps the loud version. Using `prev.hello` would wrap the original.

</details>

## Trap

Writing `prev.hello` where you meant `final.hello` for a **dependency**. The overlay evaluates, the build succeeds, and your patched library is silently ignored by everything that depends on it. Recognise it by `nix why-depends` showing two copies of a package in a closure, one patched, one not. Rule: `prev` only for the attribute you are redefining, `final` for everything else.

## Checkpoint

```quiz
[
  {"q": "In `final: prev: { hello = prev.hello.overrideAttrs ...; }`, why `prev.hello`?", "options": ["prev is faster", "Using final.hello here would be infinite recursion: hello defined in terms of itself", "prev has more packages", "final is read-only"], "answer": 1, "why": "final.hello is the result of this very overlay; referencing it while defining it never terminates."},
  {"q": "Does `nixpkgs.legacyPackages.x86_64-linux` include your flake's overlays?", "options": ["Yes, automatically", "No; you must import nixpkgs with overlays yourself", "Only overlays.default", "Only in pure mode"], "answer": 1, "why": "legacyPackages is a fixed instantiation; overlays require your own import nixpkgs { overlays = [...]; }."},
  {"q": "What makes the overlay fixpoint terminate?", "options": ["A maximum of 10 overlays", "Lazy evaluation of attribute values", "Overlays are applied in reverse", "Nix caches final"], "answer": 1, "why": "final is only forced attribute by attribute when needed, so the recursive definition is never fully evaluated at once."}
]
```
