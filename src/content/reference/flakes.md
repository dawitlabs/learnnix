---
title: Flake anatomy
order: 3
summary: A complete annotated flake.nix, the output schema table, and every field in flake.lock.
---

## A complete flake

Verified with `nix flake show` and `nix flake check --no-build` in a git-tracked directory on Nix 2.35.2. The `template/` directory holds a second flake (a dev shell).

```nix
{
  description = "Reference flake: every common output, annotated";

  inputs = {
    # A branch: nix flake update moves it forward.
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

    # A tiny flake exporting a list of system strings.
    systems.url = "github:nix-systems/default";

    # follows: flake-utils reuses OUR systems instead of its own pinned copy.
    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
  };

  outputs = { self, nixpkgs, systems, flake-utils }:
    let
      # import of a non-flake-style file: systems' flake.nix returns a list.
      supportedSystems = import systems;

      # lib.genAttrs names f  =>  { x86_64-linux = f "x86_64-linux"; ... }
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      # Our own nixpkgs instantiation so overlays apply.
      pkgsFor = system: import nixpkgs {
        inherit system;
        overlays = [ self.overlays.default ];
      };
    in
    {
      # Pure Nix value, no system level.
      overlays.default = final: prev: {
        greet = final.writeShellScriptBin "greet" ''
          echo "hello from ${final.hello.name}"
        '';
      };

      # nix build .#greet / nix build (default)
      packages = forAllSystems (system:
        let pkgs = pkgsFor system;
        in {
          default = pkgs.greet;
          hello = pkgs.hello;
        }
      );

      # nix run
      apps = forAllSystems (system: {
        default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/greet";
        };
      });

      # nix develop
      devShells = forAllSystems (system:
        let pkgs = pkgsFor system;
        in {
          default = pkgs.mkShellNoCC {
            packages = [ pkgs.nodejs_22 pkgs.pnpm_10 pkgs.biome ];
            env.TURSO_DATABASE_URL = "file:local.db";
          };
        }
      );

      # nix flake check builds these.
      checks = forAllSystems (system:
        let pkgs = pkgsFor system;
        in {
          greet-runs = pkgs.runCommand "greet-runs" { } ''
            ${pkgs.greet}/bin/greet > $out
          '';
        }
      );

      # nix fmt
      formatter = forAllSystems (system: (pkgsFor system).nixfmt);

      # nix flake init -t <this-flake>
      templates.default = {
        path = ./template;
        description = "Minimal flake with a dev shell";
      };
    };
}
```

`nix flake show` output, trimmed to `x86_64-linux` (other systems print `omitted`):

```text
git+file:///tmp/lxref-etQZ
├───apps
│   └───x86_64-linux
│       └───default: app: no description
├───checks
│   └───x86_64-linux
│       └───greet-runs: derivation 'greet-runs'
├───devShells
│   └───x86_64-linux
│       └───default: development environment 'nix-shell'
├───formatter
│   └───x86_64-linux: package 'nixfmt-1.5.0'
├───overlays
│   └───default: Nixpkgs overlay
├───packages
│   └───x86_64-linux
│       ├───default: package 'greet'
│       └───hello: package 'hello-2.12.3'
└───templates
    └───default: template: Minimal flake with a dev shell
```

`nix flake check --no-build` ended with `all checks passed!` and a warning that the darwin and aarch64 systems were omitted (`--all-systems` checks them).

## Output schema

| Attribute path | Consumed by | Value |
|---|---|---|
| `packages.<system>.<name>` | `nix build .#name`, `nix shell .#name`, `nix profile install .#name` | derivation |
| `packages.<system>.default` | `nix build`, `nix run` (fallback), `nix develop` (fallback) | derivation |
| `apps.<system>.<name>` | `nix run .#name` | `{ type = "app"; program = "<store path>/bin/x"; }` |
| `devShells.<system>.<name>` | `nix develop .#name` | `mkShell` derivation |
| `checks.<system>.<name>` | `nix flake check` | derivation that must build |
| `formatter.<system>` | `nix fmt` | derivation providing a formatter binary |
| `overlays.<name>` | `import nixpkgs { overlays = [ x.overlays.name ]; }` | `final: prev: { ... }` |
| `nixosModules.<name>` | `imports = [ x.nixosModules.name ]` | module |
| `nixosConfigurations.<host>` | `nixos-rebuild switch --flake .#host` | `nixpkgs.lib.nixosSystem { ... }` |
| `homeConfigurations.<name>` | `home-manager switch --flake .#name` | `home-manager.lib.homeManagerConfiguration { ... }` |
| `templates.<name>` | `nix flake init -t .#name`, `nix flake new dir -t .#name` | `{ path; description; welcomeText?; }` |
| `lib` | other flakes | any attribute set |
| `hydraJobs` | Hydra CI | attrset of derivations |

Rules enforced by `nix flake check`: `apps` entries need `type = "app"` and `program`; `overlays` entries must be functions of two arguments; `templates` entries need `path` and `description`; outputs with a system level that are not derivations fail.

## flake.lock fields

Real lock for the flake above, two nodes shown:

```text
{
  "nodes": {
    "root": {
      "inputs": {
        "flake-utils": "flake-utils",
        "nixpkgs": "nixpkgs",
        "systems": "systems"
      }
    },
    "flake-utils": {
      "inputs": {
        "systems": [
          "systems"
        ]
      },
      "locked": {
        "lastModified": 1731533236,
        "narHash": "sha256-l0KFg5HjrsfsO/JpG+r7fRrqm12kzFHyUHqHCVpMMbI=",
        "owner": "numtide",
        "repo": "flake-utils",
        "rev": "11707dc2f618dd54ca8739b309ec4fc024de578b",
        "type": "github"
      },
      "original": {
        "owner": "numtide",
        "repo": "flake-utils",
        "type": "github"
      }
    }
  },
  "root": "root",
  "version": 7
}
```

| Field | Meaning |
|---|---|
| `version` | Lock format version. 7 on Nix 2.35. |
| `root` | Name of the node representing this flake. |
| `nodes.<id>` | One entry per resolved input, keyed by a generated id (usually the input name). |
| `nodes.<id>.inputs` | That input's own inputs: a string is a node id; a **list** is a `follows` path from root. |
| `locked.type` | Fetch method: `github`, `gitlab`, `git`, `tarball`, `path`, `indirect`. |
| `locked.rev` | Exact commit. Absent for `tarball` from a non-git URL. |
| `locked.narHash` | SRI hash of the fetched tree. The reproducibility guarantee. |
| `locked.lastModified` | Unix timestamp of the commit. `date -d @N` to read. |
| `locked.owner` / `repo` / `url` | Location, depends on `type`. |
| `original` | What `flake.nix` asked for, including the branch (`ref`) if any. |

Only `locked` changes on `nix flake update`. A change to `original` means `flake.nix` changed. A `type` change (for example `github` to `tarball`) means the input was re-resolved through a different mechanism, such as `--override-input` with a registry name.

## Commands

| Command | Purpose |
|---|---|
| `nix flake show [--all-systems]` | Tree of outputs |
| `nix flake metadata [--json]` | Resolved URL, store path, inputs with revs |
| `nix flake check [--no-build]` | Schema validation, then build `checks` |
| `nix flake lock` | Add missing inputs to the lock |
| `nix flake update [input...]` | Re-resolve all or named inputs |
| `nix flake update --commit-lock-file` | Update and commit with a generated message |
| `nix <cmd> --override-input <name> <ref>` | One-off substitution, lock untouched |
| `nix <cmd> --no-write-lock-file` | Evaluate without touching the lock |
| `nix flake init -t <ref>#<name>` / `nix flake new <dir> -t ...` | Scaffold from a template |
| `nix flake prefetch <ref>` | Download an input into the store and print its hash |
