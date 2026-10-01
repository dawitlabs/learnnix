---
title: Install home-manager on Arch
stage: 5
order: 29
slug: home-manager-install
summary: Set up standalone, flake-based home-manager next to pacman, switch, inspect generations and roll back.
minutes: 20
---

## Why this matters

You do not need NixOS to get declarative dotfiles. Standalone home-manager runs on Arch, uses the Nix you already have, and manages only your `$HOME`. Omarchy and pacman keep owning the system. This is the lowest-risk way to start living in Nix daily, and everything you write here moves unchanged to NixOS later.

## Concept

### What home-manager is

A set of modules evaluated with `lib.evalModules` (see [The module system](/learn/module-system)), plus an activation script. The modules produce one derivation: a directory of files that should exist in your home. Activation symlinks them into place and installs packages into a profile. Nothing is copied; your `~/.config/fish/config.fish` becomes a symlink into `/nix/store`.

### The flake

Three inputs: nixpkgs, home-manager, and `follows` so both use the same nixpkgs. The lock file pins both. Unpinned home-manager against a different nixpkgs is the classic source of eval errors.

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { nixpkgs, home-manager, ... }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      homeConfigurations."dawit@laptop" = home-manager.lib.homeManagerConfiguration {
        inherit pkgs;
        modules = [ ./home.nix ];
      };
    };
}
```

Verify: `home-manager.lib.homeManagerConfiguration` takes `pkgs`, `modules`, and optionally `extraSpecialArgs`. Confirm at https://nix-community.github.io/home-manager/#sec-flakes-standalone.

The attribute name `"user@host"` matters. `home-manager switch --flake .` tries `homeConfigurations."$USER@$(hostname)"` first, then `"$USER"`. Verify: `home-manager switch --help` after install.

### The first `home.nix`

```nix
{ pkgs, ... }:
{
  home.username = "dawit";
  home.homeDirectory = "/home/dawit";
  home.stateVersion = "25.05";

  programs.home-manager.enable = true;

  home.packages = [
    pkgs.ripgrep
    pkgs.fd
  ];
}
```

`programs.home-manager.enable` puts the `home-manager` command itself into your profile, so you do not depend on `nix run` after the first switch.

### `home.stateVersion`

Not a version to update. It records which release's defaults you started with, so later home-manager releases can keep old behaviour for options whose defaults changed. Set it once, leave it. Changing it does not upgrade anything; `nix flake update` does.

### Bootstrapping

The command is run once, from the directory containing the flake. It downloads home-manager and nixpkgs; on a 700 KB/s line that is minutes, not seconds.

```sh
nix run home-manager/master -- switch --flake .
```

Afterwards, plain `home-manager switch --flake .` works because the command is now in your profile.

### What it touches

- `~/.nix-profile` is already a symlink to `~/.local/state/nix/profiles/profile`. Home-manager installs its package set into that profile as one `home-manager-path` entry.
- Managed files become symlinks: `~/.config/git/config -> /nix/store/...-home-manager-files/.config/git/config`.
- A generation link under `~/.local/state/nix/profiles/home-manager` and a GC root under `~/.local/state/home-manager/gcroots/`. Verify: `ls ~/.local/state/nix/profiles/` after the first switch.
- Session variables land in `~/.nix-profile/etc/profile.d/hm-session-vars.sh`. Your login shell must source it. The fish module does this when `programs.fish.enable = true`. Verify: `grep hm-session ~/.config/fish/config.fish` after enabling.

### Generations and rollback

Every switch is a new generation. Old ones stay until garbage collection.

```sh
home-manager generations
```

Prints one line per generation with its store path. To roll back, run that generation's activation script directly:

```sh
/nix/store/<hash>-home-manager-generation/activate
```

Verify: there is no `home-manager rollback` subcommand in the version you install; check `home-manager --help`.

### Coexisting with pacman

- PATH order decides who wins. On this machine `~/.nix-profile/bin` is already ahead of `/usr/bin`, so a Nix `fish` or `neovim` shadows the pacman one. Check with `type -a nvim`.
- Keep the login shell as `/usr/bin/fish` from pacman. A store path is not in `/etc/shells`, and `chsh` to a path that changes every update is fragile. Let home-manager manage the config, pacman the binary.
- GUI apps from Nix on Arch need no special handling for Wayland, but icons and `.desktop` files only appear in Walker if `~/.nix-profile/share` is on `XDG_DATA_DIRS`. `hm-session-vars.sh` adds it.

## Try it

1. Confirm home-manager is packaged in your pinned nixpkgs. No download beyond nixpkgs itself:

```sh
nix eval --raw nixpkgs#home-manager.version
```

```text
0-unstable-2026-08-06
```

2. Look at the profile home-manager will join:

```sh
ls -la ~/.nix-profile ~/.local/state/nix/profiles/
```

```text
lrwxrwxrwx 1 dave dave 44 Jun 16 14:38 /home/dave/.nix-profile -> /home/dave/.local/state/nix/profiles/profile
/home/dave/.local/state/nix/profiles/:
lrwxrwxrwx 1 dave dave 14 Sep 25 11:11 profile -> profile-1-link
lrwxrwxrwx 1 dave dave 51 Sep 25 11:11 profile-1-link -> /nix/store/5mcaq7843v0ixswhgbjdh6y9f2srk9wh-profile
```

3. Parse the two files above before you fetch anything:

```sh
nix-instantiate --parse flake.nix >/dev/null && nix-instantiate --parse home.nix >/dev/null && echo ok
```

```text
ok
```

## Exercise

Create `~/dev/home/` with the flake and `home.nix` above. Run `git init && git add .` and `nix flake check --no-build`. Do not switch yet. Explain in one sentence why `git add` was necessary.

<details>
<summary>Solution</summary>

```sh
mkdir -p ~/dev/home && cd ~/dev/home
# write flake.nix and home.nix
git init
git add flake.nix home.nix
nix flake check --no-build
```

The check fetches home-manager and writes `flake.lock`. Add that too.

Flakes only see files tracked by git. Without `git add`, `./home.nix` does not exist from the flake's point of view and you get `path '/nix/store/...-source/home.nix' does not exist`. See [Inputs and the lock file](/learn/inputs-and-lock).

</details>

## Trap

The first switch fails with a message like:

```text
Existing file '/home/dawit/.config/fish/config.fish' is in the way of '/nix/store/...-home-manager-files/.config/fish/config.fish'
Please do one of the following:
- Move or remove the above files and try again.
- In standalone mode, use 'home-manager switch -b backup' to back up files automatically.
```

Home-manager refuses to overwrite a file it did not create. That is a feature. Do not pass `-b` blindly; chezmoi still manages that file. Decide per file: either port it to a home-manager option or stop managing it with chezmoi. [Migrate from chezmoi](/learn/migrate-from-chezmoi) covers the order. Verify: exact wording differs between versions, and with `-b` an existing backup produces "would be clobbered by backing up".

## Checkpoint

```quiz
[
  {"q": "What does changing `home.stateVersion` from 25.05 to 26.05 do?", "options": ["Upgrades all packages to the 26.05 release", "Updates the flake lock", "Changes which legacy defaults home-manager keeps for you; nothing else", "Rebuilds the profile from scratch"], "answer": 2, "why": "stateVersion only selects compatibility defaults; package versions come from the nixpkgs input and its lock."},
  {"q": "A file home-manager manages in $HOME is normally what?", "options": ["A copy owned by root", "A symlink into /nix/store", "A bind mount", "A copy with a .hm suffix"], "answer": 1, "why": "Activation links each managed path to the home-manager-files derivation in the store."},
  {"q": "Why keep /usr/bin/fish as the login shell instead of the Nix fish?", "options": ["Nix fish does not support Wayland", "Store paths are not in /etc/shells and change on every update", "home-manager cannot manage fish", "pacman would remove it"], "answer": 1, "why": "chsh needs a stable path listed in /etc/shells; let home-manager manage config, pacman the binary."}
]
```
