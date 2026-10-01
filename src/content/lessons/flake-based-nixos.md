---
title: Flake-based NixOS
stage: 6
order: 34
slug: flake-based-nixos
summary: Define laptop and VPS as nixosConfigurations in one flake, pass inputs with specialArgs, and attach home-manager.
minutes: 20
---

## Why this matters

Channels are mutable; a flake pins nixpkgs and home-manager in `flake.lock` so laptop and VPS are built from the same revision. One repo, two hosts, shared modules. `nixos-rebuild switch --flake .#laptop` is the whole deploy command. You can evaluate the flake on Arch now, before NixOS exists anywhere.

## Concept

### `nixosSystem`

`nixpkgs.lib.nixosSystem` is a thin wrapper over `nixos/lib/eval-config.nix` from [Anatomy of configuration.nix](/learn/configuration-nix). It is in the flake's `lib` output, not in `pkgs.lib`; verified: `(builtins.getFlake "nixpkgs").lib ? nixosSystem` is `true`.

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, home-manager, ... }@inputs:
    {
      nixosConfigurations = {
        laptop = nixpkgs.lib.nixosSystem {
          system = "x86_64-linux";
          specialArgs = { inherit inputs; };
          modules = [
            ./hosts/laptop/configuration.nix
            ./modules/common.nix
            home-manager.nixosModules.home-manager
            {
              home-manager.useGlobalPkgs = true;
              home-manager.useUserPackages = true;
              home-manager.extraSpecialArgs = { inherit inputs; };
              home-manager.users.dawit = import ./home/dawit.nix;
            }
          ];
        };

        vps = nixpkgs.lib.nixosSystem {
          system = "x86_64-linux";
          specialArgs = { inherit inputs; };
          modules = [
            ./hosts/vps/configuration.nix
            ./modules/common.nix
          ];
        };
      };
    };
}
```

Each host is one `nixosSystem` call with its own module list. Shared behaviour lives in `modules/common.nix` and is imported by both. Host-specific files hold `hardware-configuration.nix`, hostname and the hardware-bound options.

### `specialArgs`: handing inputs to modules

Modules receive `{ config, lib, pkgs, ... }`. They do not receive your flake inputs unless you pass them. `specialArgs` adds attributes to every module's argument set, and unlike `_module.args` it is available during `imports` resolution, which is why inputs go there.

```nix
{ inputs, lib, ... }:
{
  networking.hostName = lib.mkDefault "from-${inputs.name}";
}
```

Verified with `eval-config.nix` and `specialArgs = { inputs = { name = "flake"; }; }`:

```text
"from-flake"
```

In real use you write `imports = [ inputs.agenix.nixosModules.default ];` or `environment.systemPackages = [ inputs.something.packages.x86_64-linux.default ];`.

### home-manager as a NixOS module

`home-manager.nixosModules.home-manager` makes `home-manager.users.<name>` an option whose value is a home-manager module, the same `home.nix` you wrote standalone. The system switch now activates the user environment too; one command, one generation.

- `useGlobalPkgs` makes home-manager reuse the system's `pkgs`, so overlays and `nixpkgs.config` apply once.
- `useUserPackages` installs `home.packages` to `/etc/profiles/per-user/<name>` instead of `~/.nix-profile`.
- `extraSpecialArgs` is `specialArgs` for the home-manager module tree.

Verify: these four option names at https://home-manager-options.extranix.com (select the NixOS module). Home-manager source is not available offline here.

Trade-off: a broken `home.nix` now blocks the system switch. The standalone setup from [Install home-manager](/learn/home-manager-install) keeps them independent. Pick one; running both on the same user is state 4 from [Migrate from chezmoi](/learn/migrate-from-chezmoi).

### Commands, run on the NixOS host

```sh
sudo nixos-rebuild switch --flake .#laptop
sudo nixos-rebuild test --flake /etc/nixos#laptop
```

`--flake PATH#NAME` selects `nixosConfigurations.NAME`. With no `#NAME`, `nixos-rebuild` uses the machine's hostname. Keep attribute names equal to hostnames and you never type the suffix.

Updating is `nix flake update` followed by a `test`, then `switch`, then a commit of `flake.lock`. The lock file is the upgrade; the commit is the rollback.

## Try it

1. Build a minimal flake on Arch. In a fresh directory with the `vps.nix` from the previous lesson:

```nix
{
  inputs.nixpkgs.url = "nixpkgs";

  outputs = { self, nixpkgs, ... }@inputs:
    {
      nixosConfigurations.vps = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        specialArgs = { inherit inputs; };
        modules = [ ./vps.nix ];
      };
    };
}
```

`"nixpkgs"` as a URL resolves through your registry to the already-downloaded nixpkgs, so this fetches nothing new.

```sh
git init && git add . && nix flake show
```

```text
git+file:///tmp/learnnix-verify/fl
└───nixosConfigurations
    └───vps: NixOS configuration
```

2. Evaluate an option through the flake path, exactly as `nixos-rebuild` would:

```sh
nix eval --raw .#nixosConfigurations.vps.config.networking.hostName
```

```text
vps
```

3. Inspect what got locked: `jq .nodes.nixpkgs.locked.type flake.lock` prints `"tarball"`, because the registry entry points at a channel tarball. A `github:` URL would lock to `"github"` with a `rev`.

## Exercise

Add a second host `laptop` to the Try-it flake that imports the same `vps.nix` but overrides the hostname, without editing `vps.nix`. Evaluate both hostnames.

<details>
<summary>Solution</summary>

```nix
{
  inputs.nixpkgs.url = "nixpkgs";

  outputs = { self, nixpkgs, ... }@inputs:
    let
      mkHost = extra: nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        specialArgs = { inherit inputs; };
        modules = [ ./vps.nix ] ++ extra;
      };
    in
    {
      nixosConfigurations = {
        vps = mkHost [ ];
        laptop = mkHost [ { networking.hostName = nixpkgs.lib.mkForce "laptop"; } ];
      };
    };
}
```

`vps.nix` sets `hostName = "vps"` as a plain definition (priority 100), so the override needs `mkForce`. The cleaner long-term fix is `mkDefault` inside the shared module. `nix eval --raw .#nixosConfigurations.laptop.config.networking.hostName` prints `laptop`.

</details>

## Trap

A new module file that is not `git add`ed. The error on Nix 2.35 is explicit, but it arrives after a long evaluation and is easy to misread as a module bug:

```text
error: Path 'extra.nix' in the repository "/tmp/learnnix-verify/fl" is not tracked by Git.
To make it visible to Nix, run:
git -C "/tmp/learnnix-verify/fl" add -N "extra.nix"
```

Flakes copy the git tree, not the working directory. `git add -N` (intent to add) is enough; you do not have to commit.

## Checkpoint

```quiz
[
  {"q": "Where does `nixosSystem` live?", "options": ["pkgs.lib", "The nixpkgs flake's lib output", "builtins", "home-manager"], "answer": 1, "why": "nixpkgs' flake.nix extends lib with nixosSystem; it is not part of the plain lib you import from pkgs."},
  {"q": "Why pass flake inputs through `specialArgs` rather than `_module.args`?", "options": ["_module.args is deprecated", "specialArgs is available while resolving imports, so modules can import from inputs", "specialArgs is faster", "There is no difference"], "answer": 1, "why": "imports must be known before the fixpoint; specialArgs are injected outside it."},
  {"q": "What does `nixos-rebuild switch --flake .` with no `#name` select?", "options": ["The first configuration alphabetically", "nixosConfigurations.default", "The configuration named after the machine's hostname", "It errors"], "answer": 2, "why": "nixos-rebuild falls back to the current hostname as the attribute name."}
]
```
