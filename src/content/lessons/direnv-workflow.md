---
title: direnv workflow
stage: 1
order: 6
slug: direnv-workflow
summary: Make the dev shell load into your fish session automatically on cd, with nix-direnv caching so it is instant.
minutes: 15
---

## Why this matters

`nix develop` drops you into bash. Your fish config, abbreviations and prompt are gone, and you have to remember to run it. direnv fixes both: `cd` into the project and the flake's environment is merged into your running fish shell. Leave the directory and it is gone. This is the part that makes Nix dev shells feel like mise.

## Concept

### What direnv does

direnv is a shell hook. Before every prompt it checks for a `.envrc` in the current directory or a parent. If one exists and you have approved it, direnv runs it in bash, diffs the environment, and exports the diff into your shell. `cd` out and the diff is reverted.

`.envrc` is bash. For Nix it contains one line:

```text
use flake
```

### Why nix-direnv

Plain direnv has a `use flake` too, but it re-runs `nix develop` on every `.envrc` reload and has no GC protection. nix-direnv replaces it with a version that:

- caches the evaluated environment in `.direnv/` and only re-evaluates when `flake.nix` or `flake.lock` changes
- registers the shell's store paths as GC roots so `nix store gc` cannot delete your toolchain

The second point matters on your line. Without it, a GC after a week means re-downloading Node.

Versions at this nixpkgs revision:

```sh
nix eval nixpkgs#direnv.version
nix eval nixpkgs#nix-direnv.version
```

```text
"2.37.1"
"3.2.0"
```

`nix eval` takes one installable; two is `error: unexpected argument`.

### Install

Both are plain packages. Shown as text; they modify your profile:

```text
nix profile add nixpkgs#direnv nixpkgs#nix-direnv
```

Alternatively `pacman -S direnv` for direnv and keep nix-direnv from Nix. Either is fine. Do not install direnv from both.

### Wire nix-direnv into direnv

direnv reads `~/.config/direnv/direnvrc` at startup. Point it at nix-direnv's script:

```text
source $HOME/.nix-profile/share/nix-direnv/direnvrc
```

Verify the file exists after install: `ls ~/.nix-profile/share/nix-direnv/direnvrc`. The package contains exactly that one file.

### The fish hook

Add to `~/.config/fish/config.fish`, after the `fish_add_path` line for `~/.nix-profile/bin`:

```text
direnv hook fish | source
```

What it installs: a `fish_prompt` event handler that runs `direnv export fish | source`, plus a `PWD` variable watcher so the environment updates on `cd` without waiting for a prompt. You can read it:

```sh
nix run nixpkgs#direnv -- hook fish | head -3
```

```text
    function __direnv_export_eval --on-event fish_prompt;
        "/nix/store/ypczs6c9ppq70azvkd5cc0h7silpq9n0-direnv-2.37.1/bin/direnv" export fish | source;
```

Since you manage dotfiles with chezmoi, the `config.fish` and `direnvrc` lines belong in the chezmoi source, not edited in place.

### Per project

In a project with a `flake.nix` (from [Dev shells](/learn/dev-shells)):

```text
echo "use flake" > .envrc
direnv allow
```

`direnv allow` is the approval step. direnv refuses to run any `.envrc` you have not explicitly allowed, and re-asks when the file changes. This is the security boundary: a cloned repo cannot run code in your shell until you say so.

The first load runs the full `nix develop` evaluation. Later loads read the cache and take milliseconds. After editing `flake.nix`, direnv notices and re-evaluates on the next prompt.

### Gitignore

```text
.direnv/
```

Add it to the project `.gitignore`. The cache is machine-specific. Commit `.envrc`; it is one line and teammates with direnv get the shell for free.

The gitignore entry is for git only. Nix never needed it: flakes copy tracked files, and `.direnv/` is untracked, so it was never going into the store anyway.

### Fish quoting inside `.envrc`

`.envrc` is bash even though your shell is fish. Variables set there use bash syntax: `export DATABASE_URL=file:local.db`, not `set -x`. direnv translates the result into fish for you.

## Try it

Confirm the hook text direnv would install, without installing anything:

```sh
nix run nixpkgs#direnv -- hook fish | grep -c 'on-event fish_prompt'
```

```text
1
```

Confirm nix-direnv's `use flake` implementation exists in the package:

```sh
nix build nixpkgs#nix-direnv --no-link --print-out-paths
```

```text
/nix/store/7p4ay46q9vmp8ph7sp90nfp75yz0h9gq-nix-direnv-3.2.0
```

```sh
grep -c '^use_flake()' /nix/store/7p4ay46q9vmp8ph7sp90nfp75yz0h9gq-nix-direnv-3.2.0/share/nix-direnv/direnvrc
```

```text
1
```

## Exercise

Your project's flake lives in `nix/` rather than the repo root. Write the `.envrc` line that loads it, and explain what happens to the cache location.

<details>
<summary>Solution</summary>

```text
use flake ./nix
```

`use flake` takes a flake reference as its argument, exactly like `nix develop`. Any flakeref works: `./nix`, `.#ci` (a non-default shell), `github:owner/repo`. The cache still goes in `.direnv/` next to the `.envrc`, not next to the flake, because the cache belongs to the directory direnv is managing.

Verify: in the nix-direnv source, `use_flake()` sets `flake_expr="${1:-.}"`, so no argument means the current directory.

</details>

## Trap

`direnv: error .envrc is blocked. Run 'direnv allow' to approve its content` appearing after every `git pull`. Someone changed `.envrc` and direnv correctly re-blocks it. Read the diff, then `direnv allow`. Do not set `whitelist` in direnv's config to silence this; it disables the only protection against a repo running arbitrary bash in your shell.

## Checkpoint

```quiz
[
  {"q": "What does nix-direnv add over plain direnv's use flake?", "options": ["fish support", "Caching plus GC roots for the shell's store paths", "Automatic git add", "A faster nix binary"], "answer": 1, "why": "nix-direnv caches the evaluated environment in .direnv/ and protects it from nix store gc."},
  {"q": "Where does the nix-direnv source line go?", "options": [".envrc", "~/.config/direnv/direnvrc", "config.fish", "flake.nix"], "answer": 1, "why": "direnvrc is direnv's global startup file; .envrc stays as just 'use flake'."},
  {"q": "Why must you run direnv allow?", "options": ["To install direnv", "To approve executing this .envrc, which is arbitrary bash", "To create .direnv/", "To add the hook to fish"], "answer": 1, "why": "direnv never runs an .envrc you have not approved, and re-asks whenever the file changes."}
]
```
