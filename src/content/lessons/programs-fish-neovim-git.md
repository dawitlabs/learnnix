---
title: fish, Neovim and git as options
stage: 5
order: 30
slug: programs-fish-neovim-git
summary: Declare your shell, editor and git config with home-manager options instead of hand-managed dotfiles.
minutes: 20
---

## Why this matters

These three are the tools you touch all day and the ones chezmoi currently manages. Moving them to home-manager options means the fish plugins, Neovim plugins and git tooling are pinned in `flake.lock` with everything else, and a `home-manager switch` on a new machine gives you the exact same shell.

Home-manager source is not available offline on this machine, so option names below are the long-stable ones. Verify: search any name at https://home-manager-options.extranix.com before you switch.

## Concept

### Three layers in every `programs.*` module

1. `enable` installs the package and tells home-manager to manage its config.
2. Typed options for the common settings (`shellAliases`, `plugins`, `userName`).
3. An escape hatch for raw config text (`interactiveShellInit`, `extraLuaConfig`, `extraConfig`).

Use layer 2 when it exists; it is checked at eval time. Fall back to layer 3 for the rest. Do not mix a managed file with hand edits: the file is a read-only store symlink.

### fish

```nix
{ pkgs, ... }:
{
  programs.fish = {
    enable = true;

    shellAliases = {
      g = "git";
      lg = "lazygit";
      nrs = "home-manager switch --flake ~/dev/home";
    };

    shellAbbrs = {
      gco = "git checkout";
      gst = "git status";
    };

    interactiveShellInit = ''
      set -g fish_greeting
      fish_add_path --prepend ~/.nix-profile/bin
      mise activate fish | source
    '';

    plugins = [
      { name = "fzf-fish"; src = pkgs.fishPlugins.fzf-fish.src; }
      { name = "pure"; src = pkgs.fishPlugins.pure.src; }
    ];
  };
}
```

`shellAliases` become `alias` lines; `shellAbbrs` become `abbr -a`. `plugins` take a `src` derivation, so `pkgs.fishPlugins.<name>.src` is the idiom; the plugin's own files are linked into `~/.config/fish/conf.d`. The `mise activate` line keeps mise working; home-manager does not replace it.

### Neovim, two ways

Way one: let home-manager own plugins, keep Lua as text.

```nix
{ pkgs, ... }:
{
  programs.neovim = {
    enable = true;
    defaultEditor = true;
    viAlias = true;
    vimAlias = true;

    plugins = with pkgs.vimPlugins; [
      telescope-nvim
      plenary-nvim
      nvim-treesitter.withAllGrammars
    ];

    extraPackages = [ pkgs.ripgrep pkgs.fd ];

    extraLuaConfig = ''
      vim.g.mapleader = " "
      vim.opt.number = true
      require("telescope").setup({})
    '';
  };
}
```

`plugins` are real packages: no `lazy.nvim` download at startup, no network on first launch. `nvim-treesitter.withAllGrammars` ships compiled parsers, which is the one thing that regularly breaks when a plugin manager compiles them on the fly. Verify: `nix eval nixpkgs#vimPlugins.nvim-treesitter.withAllGrammars.name`.

Way two: you already have a Lua config you like. Keep it as files and let home-manager link the directory:

```nix
{ config, pkgs, ... }:
{
  programs.neovim.enable = true;

  xdg.configFile."nvim" = {
    source = ./nvim;
    recursive = true;
  };
}
```

`./nvim` lives in the flake repo next to `home.nix`. `recursive = true` links each file rather than the directory, so other modules can still add files under `~/.config/nvim`. The whole tree is read-only after switch. If you still edit it daily, use `mkOutOfStoreSymlink` from [Migrate from chezmoi](/learn/migrate-from-chezmoi).

Do not use both ways on the same path. `programs.neovim.extraLuaConfig` writes `~/.config/nvim/init.lua`; so does your tree. Home-manager reports two definitions for one file.

### git

```nix
{ pkgs, ... }:
{
  programs.git = {
    enable = true;
    userName = "Your Name";
    userEmail = "you@example.com";

    signing = {
      key = "ssh-ed25519 AAAA...";
      signByDefault = true;
    };

    extraConfig = {
      init.defaultBranch = "main";
      gpg.format = "ssh";
      push.autoSetupRemote = true;
      pull.rebase = true;
    };
  };

  programs.delta = {
    enable = true;
    options.navigate = true;
  };
}
```

`extraConfig` is an attrset rendered to INI, so section names are attribute paths. `gpg.format = "ssh"` makes `signing.key` an SSH public key instead of a GPG ID.

Verify two things here. First, newer home-manager releases deprecate `userName`/`userEmail` in favour of `programs.git.settings.user.name` and `settings.user.email`; a deprecation warning at switch tells you. Second, delta moved from `programs.git.delta` to a top-level `programs.delta` module; if `programs.delta` does not exist in your pinned version, use `programs.git.delta.enable`. `programs.difftastic` has the same history. Check the option search for your lock's revision.

### Packages without modules

```nix
{ pkgs, ... }:
{
  home.packages = [
    pkgs.turso-cli
    pkgs.biome
    pkgs.lazygit
    pkgs.fzf
  ];
}
```

`home.packages` installs into the profile and nothing else. Prefer a `programs.*` module when one exists, because it also wires config and shell integration.

## Try it

1. Check the plugin packages exist in your pinned nixpkgs. This evaluates names only, no download:

```sh
nix eval --impure --json --expr 'let p = (builtins.getFlake "nixpkgs").legacyPackages.x86_64-linux; in [ p.fishPlugins.fzf-fish.pname p.vimPlugins.telescope-nvim.pname p.delta.pname ]'
```

```text
["fzf.fish","telescope.nvim","delta"]
```

`--impure` is required because `nixpkgs` here is a registry name, not a locked reference. `pname` strings may differ by revision; the point is that evaluation succeeds.

2. Parse each snippet above after saving it:

```sh
nix-instantiate --parse fish.nix >/dev/null && echo ok
```

```text
ok
```

## Exercise

Write a `git.nix` that sets `init.defaultBranch`, enables rebase on pull, and adds an alias `git lg` for `log --oneline --graph --decorate`. Use typed options where they exist.

<details>
<summary>Solution</summary>

```nix
{
  programs.git = {
    enable = true;
    aliases = {
      lg = "log --oneline --graph --decorate";
    };
    extraConfig = {
      init.defaultBranch = "main";
      pull.rebase = true;
    };
  };
}
```

`programs.git.aliases` is a typed `attrsOf str`; it renders to the `[alias]` section. Verify the name at the option search; if absent, `extraConfig.alias.lg` produces the same INI.

</details>

## Trap

Putting your real email into `userEmail` in a flake you push to GitHub. The repo is public, the string is in `flake.nix`'s closure, and the lock file does not hide it. Keep identity in a separate `identity.nix` that is gitignored and imported with `imports = [ ./identity.nix ];`, or pass it through `extraSpecialArgs`. For keys and tokens, never any file in the repo; see [Secrets management](/learn/secrets-management).

## Checkpoint

```quiz
[
  {"q": "What does `pkgs.fishPlugins.fzf-fish.src` give the fish module?", "options": ["A compiled binary", "The plugin's source tree to link into conf.d", "A URL to download at shell start", "A fish script string"], "answer": 1, "why": "programs.fish.plugins takes a src derivation and links its functions and conf.d into your fish config."},
  {"q": "You set `programs.neovim.extraLuaConfig` and also `xdg.configFile.\"nvim\".source`. What happens?", "options": ["Lua config wins", "The directory wins", "Two definitions for init.lua; activation fails", "They are concatenated"], "answer": 2, "why": "Both produce ~/.config/nvim/init.lua, and a file can have only one source."},
  {"q": "Where should your real git email live if the flake is public?", "options": ["In flake.lock", "In userEmail, it is fine", "In a gitignored imported file or extraSpecialArgs", "In home.stateVersion"], "answer": 2, "why": "Anything committed to a public flake is public; keep identity out of the tracked files."}
]
```
