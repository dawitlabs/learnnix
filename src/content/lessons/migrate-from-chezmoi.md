---
title: Migrate from chezmoi
stage: 5
order: 31
slug: migrate-from-chezmoi
summary: Move dotfiles from chezmoi to home-manager one program at a time without a broken shell in between.
minutes: 15
---

## Why this matters

Your dotfiles live in `~/.local/share/chezmoi` and chezmoi v2.72 applies them. Home-manager wants to own the same paths. Two tools writing one file is how you end up with a shell that starts differently on each machine. The migration has to be incremental, and each step must leave you with a working desktop.

## Concept

### The conflict

Chezmoi writes real files. Home-manager writes symlinks into the store and refuses to replace a file it did not create. So for any given path there are exactly three valid states:

1. chezmoi owns it, home-manager does not mention it.
2. home-manager owns it, chezmoi has forgotten it (`chezmoi forget`).
3. nobody owns it.

Never state 4: both.

### Inventory first

```sh
chezmoi managed --include=files
```

On this machine the list starts:

```text
.bash_profile
.bashrc
.claude/CLAUDE.md
.claude/settings.json
.config/alacritty/alacritty.toml
```

Group the output by program. Each group is one migration step and one commit.

### Three ways to bring a file across

Ranked from most to least Nix.

Port to options. Fish aliases become `programs.fish.shellAliases`; git config becomes `programs.git`. See [fish, Neovim and git as options](/learn/programs-fish-neovim-git). Checked at eval, searchable, composable.

Copy the file as-is. For configs with no module or ones you do not want to translate yet:

```nix
{
  xdg.configFile."alacritty/alacritty.toml".source = ./dotfiles/alacritty.toml;
  xdg.configFile."waybar".source = ./dotfiles/waybar;
  home.file.".ideavimrc".source = ./dotfiles/ideavimrc;
}
```

`xdg.configFile."x"` targets `~/.config/x`. `home.file."x"` targets `~/x`. A directory `source` links the whole directory; add `recursive = true` to link file by file instead. The file is copied into the store, so it is read-only and changes need a switch.

Keep it editable. For a config you still tweak several times a day (Hyprland keybinds, Neovim), link to the working tree rather than the store:

```nix
{ config, ... }:
{
  xdg.configFile."hypr".source =
    config.lib.file.mkOutOfStoreSymlink "${config.home.homeDirectory}/dev/home/dotfiles/hypr";
}
```

`mkOutOfStoreSymlink` creates a symlink to an absolute path outside the store. Edits take effect immediately, no switch. The cost: that file is not part of the closure, so a fresh machine needs the repo at that exact path before activation. Use an absolute path built from `config.home.homeDirectory`, never a relative one; a relative path would be copied into the store and the point is lost. Verify: `config.lib.file.mkOutOfStoreSymlink` is a function home-manager injects, not in nixpkgs; confirm at the option search if your version differs.

### The loop

For each program group:

1. Write the home-manager side (options, `xdg.configFile`, or `mkOutOfStoreSymlink`).
2. `chezmoi forget ~/.config/<program>` so chezmoi stops tracking the path. Chezmoi forgets, it does not delete the target.
3. Move the target out of the way: `mv ~/.config/<program> ~/.config/<program>.pre-hm`.
4. `home-manager switch --flake ~/dev/home`.
5. Open the program. If it works, delete the `.pre-hm` copy and commit.

Step 3 is what avoids the "is in the way of" error from [Install home-manager](/learn/home-manager-install). Keep the backup until step 5 so a bad switch is a one-command undo: `mv` it back.

### Running both

During the transition `chezmoi apply` and `home-manager switch` both run, on disjoint paths. That is fine. Add a `chezmoi managed` check to your head before each `chezmoi apply` so you notice if a forgotten path crept back in via `chezmoi add`.

### Deleting chezmoi

When `chezmoi managed` prints nothing you care about:

```sh
chezmoi purge
```

That removes `~/.local/share/chezmoi` and `~/.config/chezmoi`, nothing else. Then `sudo pacman -Rns chezmoi` on your own machine when you are ready. Keep the old git history; `git log` of the chezmoi repo is your record of why a setting exists.

## Try it

1. Count what you are migrating:

```sh
chezmoi managed --include=files | wc -l
```

```text
176
```

That is this laptop today. Yours will differ, and the number is the honest size of the job: do it in groups, not in one evening.

2. Parse the editable-link snippet after saving it as `hypr.nix`:

```sh
nix-instantiate --parse hypr.nix >/dev/null && echo ok
```

```text
ok
```

3. See what chezmoi has in its source state for one file without applying anything:

```sh
chezmoi cat ~/.config/fish/config.fish | head -5
```

Output is your own config. If it prints nothing, fish is not chezmoi-managed and can be ported straight to `programs.fish`.

## Exercise

Plan the first three groups to migrate, in order, and justify the order in one line each. Then write the module for the group you would do first.

<details>
<summary>Solution</summary>

A defensible order:

1. git: smallest config, pure options, no runtime risk if wrong.
2. fish: daily-driven, but a broken fish config still gives you a prompt; `programs.fish` covers aliases and init.
3. Hyprland: highest blast radius, so last, and via `mkOutOfStoreSymlink` because you still edit it often.

```nix
{
  programs.git = {
    enable = true;
    extraConfig = {
      init.defaultBranch = "main";
      pull.rebase = true;
      push.autoSetupRemote = true;
    };
  };
}
```

Then `chezmoi forget ~/.config/git/config`, move the file aside, switch.

</details>

## Trap

`mkOutOfStoreSymlink` with a path that is not in place yet. On a new machine you clone `~/dev/home`, run the first switch, and `~/.config/hypr` is a dangling symlink because the repo lives in `~/code/home` there. The switch succeeds; Hyprland starts with defaults. Recognise it by `ls -la ~/.config/hypr` showing a red target. Fix by keeping one canonical repo path across machines, or by moving the config into the store once it stabilises.

## Checkpoint

```quiz
[
  {"q": "What does `chezmoi forget <path>` do?", "options": ["Deletes the file from $HOME", "Stops tracking the path in the source state only", "Reverts the file to the last applied version", "Removes chezmoi"], "answer": 1, "why": "forget edits chezmoi's source state; the target file in $HOME is untouched."},
  {"q": "Why must the argument to `mkOutOfStoreSymlink` be an absolute path string?", "options": ["Nix forbids relative paths", "A relative path literal is copied into the store, defeating the purpose", "Symlinks cannot be relative", "home-manager requires it for permissions"], "answer": 1, "why": "Path literals are added to the store at eval time; a string built from config.home.homeDirectory is not."},
  {"q": "A path is managed by both chezmoi and home-manager. What is the correct fix?", "options": ["Run chezmoi apply after every switch", "Use home-manager switch -b every time", "Pick one owner; forget it in chezmoi or remove it from home-manager", "Make the file world-writable"], "answer": 2, "why": "Two writers on one path guarantees drift; every path needs exactly one owner."}
]
```
