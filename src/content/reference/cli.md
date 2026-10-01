---
title: CLI cheatsheet
order: 1
summary: Every nix subcommand you will use, grouped by task, with the old-CLI equivalent.
---

All commands verified against Nix 2.35.2 with `nix <cmd> --help`. `<inst>` is an installable such as `nixpkgs#hello`, `.#default`, or a store path. Commands marked "writes" change your profile or store roots; everything else is read-only apart from cache downloads.

## Run, shell, develop

| Command | What it does |
|---|---|
| `nix run <inst>` | Build or fetch, run `meta.mainProgram`, exit. Nothing installed. |
| `nix run <inst> -- <args>` | Same, passing arguments to the program. |
| `nix shell <inst>...` | Subshell with the packages on PATH. `exit` to leave. |
| `nix shell <inst> -c <cmd> <args>` | Run one command with the packages on PATH. |
| `nix develop` | Enter `devShells.<system>.default` of the flake in cwd (bash). |
| `nix develop .#name` | Enter a named dev shell. |
| `nix develop -c <cmd>` | Run one command inside the dev shell. `-c fish` for your shell. |
| `nix develop -i` | Ignore the current environment (`--ignore-env`). |
| `nix print-dev-env` | Print the dev shell environment as bash. What nix-direnv caches. |

## Search, eval, repl

| Command | What it does |
|---|---|
| `nix search nixpkgs <regex>` | Search names and descriptions. First run builds a cache. |
| `nix search nixpkgs <regex> -e <regex>` | Exclude matches. |
| `nix search nixpkgs <regex> --json` | Machine-readable, keyed by full attribute path. |
| `nix eval <inst>` | Evaluate an attribute, print as Nix. |
| `nix eval --json <inst>` | Print as JSON. |
| `nix eval --raw <inst>` | Print a string without quotes. |
| `nix eval --expr '<nix>'` | Evaluate an inline expression (pure). |
| `nix eval --impure --expr '<nix>'` | Allow `getFlake`, `currentSystem`, absolute paths. |
| `nix eval -f file.nix [attr]` | Evaluate a file, optionally one attribute. |
| `nix eval <inst> --apply 'f: ...'` | Apply a function to the value before printing. |
| `nix repl` | Interactive prompt. `:?` for commands. |
| `nix repl nixpkgs` | Prompt with a flake's outputs loaded. |
| `nix repl -f file.nix` | Prompt with a file's attributes loaded. |

## Build, log, derivation

| Command | What it does |
|---|---|
| `nix build <inst>` | Build, create `./result` symlink (a GC root). |
| `nix build <inst> --no-link --print-out-paths` | Build, no symlink, print store path. |
| `nix build <inst> -o <path>` | Custom symlink name. |
| `nix build <inst> --dry-run` | Show what would be built or fetched. |
| `nix build <inst> -L` | Stream build logs (`--print-build-logs`). |
| `nix build <inst> --rebuild` | Rebuild even if present; checks reproducibility. |
| `nix log <inst>` | Show a past build log. Not available for substituted paths. |
| `nix derivation show <inst>` | Print the `.drv` as JSON: inputs, env, builder. |

## Store

| Command | What it does |
|---|---|
| `nix path-info <inst>` | Print the store path. |
| `nix path-info -r <inst>` | Print the closure (recursive references). |
| `nix path-info -rSh <inst>` | Closure with human-readable closure sizes. |
| `nix path-info --json <inst>` | Metadata: narSize, references, registration time. |
| `nix why-depends <inst> <inst>` | Show the reference chain between two paths. |
| `nix store gc` | Delete every unreachable path. Writes. |
| `nix store gc --dry-run` | Count what would be deleted. |
| `nix store gc --max 1G` | Stop after freeing roughly that much. Writes. |
| `nix store optimise` | Hard-link identical files. Writes. |
| `nix store delete <path>` | Delete one path if unreferenced. Writes. |
| `nix-collect-garbage -d` | Delete all old generations, then GC. Writes. Old CLI, still standard. |
| `nix-collect-garbage --delete-older-than 30d` | Delete generations older than 30 days, then GC. Writes. |

## Flakes

| Command | What it does |
|---|---|
| `nix flake init` | Write a template `flake.nix` in cwd. |
| `nix flake init -t <flake>#<template>` | Use a specific template. |
| `nix flake new <dir>` | Like init, into a new directory. |
| `nix flake show` | Tree of outputs. Add `--json` for scripts. |
| `nix flake metadata [flakeref]` | Resolved URL, revision, inputs, store path. |
| `nix flake lock` | Create `flake.lock` without changing existing pins. |
| `nix flake update` | Re-pin every input to latest. |
| `nix flake update <input>` | Re-pin one input. |
| `nix flake check` | Evaluate all outputs, build `checks`. |
| `nix fmt` | Run the flake's `formatter` on the tree. |

## Profile (writes unless noted)

| Command | What it does |
|---|---|
| `nix profile add <inst>...` | Install into `~/.nix-profile`. `install` is a deprecated alias. |
| `nix profile list` | Show installed packages. Read-only. |
| `nix profile remove <name>` | Uninstall by name as shown in `list`. |
| `nix profile upgrade <name>` | Re-evaluate from the original flake and rebuild. |
| `nix profile upgrade --all` | Upgrade everything. |
| `nix profile history` | List generations and what changed. Read-only. |
| `nix profile rollback` | Switch to the previous generation. |
| `nix profile wipe-history` | Delete non-current generations (then GC can free them). |
| `nix profile diff-closures` | Size and version diff between generations. Read-only. |

Verify: `nix profile --help` lists `add`, not `install`, as the canonical name in 2.35.

## Registry

| Command | What it does |
|---|---|
| `nix registry list` | All entries: `global`, `system`, `user`. |
| `nix registry add <name> <url>` | Add a user entry to `~/.config/nix/registry.json`. Writes. |
| `nix registry pin nixpkgs` | Pin `nixpkgs` to its current revision for `nixpkgs#` commands. Writes. |
| `nix registry remove <name>` | Remove a user entry. Writes. |

## Config

| Command | What it does |
|---|---|
| `nix config show` | Merged effective settings. |
| `nix config show experimental-features` | One setting. |
| `nix --version` | Version. |

## Old command to new command

| Old | New |
|---|---|
| `nix-shell -p hello` | `nix shell nixpkgs#hello` |
| `nix-shell` (with `shell.nix`) | `nix develop` (with `flake.nix`) |
| `nix-env -iA nixpkgs.hello` | `nix profile add nixpkgs#hello` |
| `nix-env -q` | `nix profile list` |
| `nix-env -e hello` | `nix profile remove hello` |
| `nix-env -u` | `nix profile upgrade --all` |
| `nix-env --rollback` | `nix profile rollback` |
| `nix-build -A hello` | `nix build .#hello` |
| `nix-instantiate --eval -E '<expr>'` | `nix eval --expr '<expr>'` |
| `nix-instantiate --parse file.nix` | no new equivalent; still the syntax check to use |
| `nix-store --gc` | `nix store gc` |
| `nix-store -q --references <path>` | `nix path-info -r <path>` (closure) or `nix derivation show` |
| `nix-store --optimise` | `nix store optimise` |
| `nix-channel --update` | `nix flake update` (per project) or `nix registry pin` (global name) |
| `nix repl '<nixpkgs>'` | `nix repl nixpkgs` |

The old commands still exist at `/usr/bin/nix-*` and are not deprecated for scripts. `nix-collect-garbage` and `nix-instantiate --parse` have no complete new-CLI replacement.

## Global flags worth knowing

| Flag | Effect |
|---|---|
| `--show-trace` | Full evaluation trace on error. |
| `-L` | Print build logs. |
| `--impure` | Allow impure builtins and absolute paths. |
| `--override-input nixpkgs <flakeref>` | Use a different input without editing the lock. |
| `--offline` | Do not hit the network; use what is in the store. |
| `--refresh` | Ignore cached flake lookups. |

Verify any flag with `nix <subcommand> --help`; the table above was checked against that output.
