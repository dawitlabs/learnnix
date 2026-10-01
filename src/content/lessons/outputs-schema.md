---
title: The outputs schema
stage: 3
order: 16
slug: outputs-schema
summary: Name every standard flake output and know which nix command consumes each one.
minutes: 12
---

## Why this matters

`nix run`, `nix build`, `nix develop` and `nix fmt` each look for a specific attribute path in your outputs. Put a package under the wrong name and the command says "does not provide attribute". Learning the schema once means you can read any project's flake and know what it offers in ten seconds.

## Concept

### Outputs are just an attribute set

Nix does not enforce the schema at evaluation time. The **commands** enforce it, and `nix flake check` validates the parts it knows. The convention is: `<output-type>.<system>.<name>` for anything that produces a build on a specific machine type, and `<output-type>.<name>` for things that are pure Nix values.

### A flake with the common outputs

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      packages.${system}.default = pkgs.hello;

      apps.${system}.default = {
        type = "app";
        program = "${pkgs.hello}/bin/hello";
      };

      devShells.${system}.default = pkgs.mkShellNoCC {
        packages = [ pkgs.hello ];
      };

      checks.${system}.hello-runs = pkgs.runCommand "hello-runs" { } ''
        ${pkgs.hello}/bin/hello > $out
      '';

      formatter.${system} = pkgs.nixfmt;

      overlays.default = final: prev: {
        greeting = final.hello;
      };
    };
}
```

### Who reads what

| Attribute path | Consumed by | Value type |
|---|---|---|
| `packages.<system>.<name>` | `nix build .#name`, `nix shell`, `nix profile install` | derivation |
| `packages.<system>.default` | `nix build` with no attribute | derivation |
| `apps.<system>.<name>` | `nix run .#name` | `{ type = "app"; program = "/path"; }` |
| `devShells.<system>.<name>` | `nix develop .#name` | derivation from `mkShell` |
| `checks.<system>.<name>` | `nix flake check` (builds them) | derivation |
| `formatter.<system>` | `nix fmt` | derivation with a binary |
| `overlays.<name>` | you, in `import nixpkgs { overlays = [...]; }` | `final: prev: { }` |
| `nixosModules.<name>` | `imports = [ ... ]` in a NixOS config | module |
| `nixosConfigurations.<host>` | `nixos-rebuild --flake .#host` | `nixpkgs.lib.nixosSystem { }` |
| `homeConfigurations.<user>` | `home-manager switch --flake .#user` | `home-manager.lib.homeManagerConfiguration { }` |
| `templates.<name>` | `nix flake init -t .#name` | `{ path; description; }` |
| `lib` | other flakes | any attrset |

`nixosConfigurations` and `homeConfigurations` have no `<system>` level: the system is baked into the configuration.

### Fallbacks

`nix run .` with no `apps.<system>.default` falls back to `packages.<system>.default` and runs the binary named by `meta.mainProgram`, or the package name. `nix develop .` with no `devShells` falls back to `packages.<system>.default` and drops you into that package's **build** environment, which is rarely what you want. Define `devShells` explicitly.

### Three ways to spell the same path

```nix
{
  a.x86_64-linux.default = 1;
  b = { x86_64-linux = { default = 1; }; };
  c = let system = "x86_64-linux"; in { ${system}.default = 1; };
}
```

All three produce identical attribute sets. The `${system}` interpolation in attribute position is what you saw in the flake above.

## Try it

Write the flake from the Concept section to a git-tracked directory and run:

```sh
nix flake show
```

```text
git+file:///tmp/lx16-wTiy
├───apps
│   └───x86_64-linux
│       └───default: app: no description
├───checks
│   └───x86_64-linux
│       └───hello-runs: derivation 'hello-runs'
├───devShells
│   └───x86_64-linux
│       └───default: development environment 'nix-shell'
├───formatter
│   └───x86_64-linux: package 'nixfmt-1.5.0'
├───overlays
│   └───default: Nixpkgs overlay
└───packages
    └───x86_64-linux
        └───default: package 'hello-2.12.3'
```

Then validate the schema without building anything:

```sh
nix flake check --no-build
```

```text
checking derivation formatter.x86_64-linux...
derivation evaluated to /nix/store/w60hbczxldsdb698rqcmlzvwjnrlbm5k-nixfmt-1.5.0.drv
checking flake output 'overlays'...
checking overlay 'overlays.default'...
all checks passed!
```

(Trimmed to the last lines.) Without `--no-build` it would also build `checks.x86_64-linux.hello-runs`, which needs the `hello` closure.

## Exercise

Add an app named `shout` that runs `hello` with the `-g` flag (`hello -g 'HELLO'`). Hint: an app's `program` must be a single path, so you need a wrapper script. `pkgs.writeShellScriptBin "name" "body"` produces a derivation with `bin/name`.

<details>
<summary>Solution</summary>

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
      shout = pkgs.writeShellScriptBin "shout" ''
        exec ${pkgs.hello}/bin/hello -g 'HELLO'
      '';
    in
    {
      apps.${system}.shout = {
        type = "app";
        program = "${shout}/bin/shout";
      };
    };
}
```

`nix run .#shout` builds the wrapper (tiny) and `hello`, then runs it.

</details>

## Trap

`nix flake check` complains:

```text
error: app 'apps.x86_64-linux.default' lacks attribute 'program'
```

An app is a plain attribute set, not a derivation. If you write `apps.x86_64-linux.default = pkgs.hello;` the check fails. Either wrap it as `{ type = "app"; program = "..."; }` or put the derivation under `packages` and let `nix run` fall back to `meta.mainProgram`.

Verify: run `nix flake check --no-build` after any change to `apps`.

## Checkpoint

```quiz
[
  {"q": "Which attribute does `nix develop` look for first?", "options": ["packages.<system>.default", "devShells.<system>.default", "shells.default", "apps.<system>.default"], "answer": 1, "why": "nix develop uses devShells.<system>.default and only falls back to packages.<system>.default when it is missing."},
  {"q": "What shape must `apps.<system>.<name>` have?", "options": ["A derivation", "A string path", "An attrset with type = \"app\" and program = path", "A list of commands"], "answer": 2, "why": "Apps are plain attribute sets; nix flake check rejects anything else."},
  {"q": "Why do `nixosConfigurations` have no `<system>` level?", "options": ["They are not flake outputs", "The system is fixed inside the configuration itself", "NixOS only supports x86_64", "It is a bug"], "answer": 1, "why": "A NixOS configuration declares its own platform, so a per-system level would be redundant."}
]
```
