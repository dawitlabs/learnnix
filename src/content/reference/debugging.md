---
title: Debugging guide
order: 5
summary: Symptom to cause to command for language, flake, build and store failures, with every message captured on Nix 2.35.
---

Every error below was produced on Nix 2.35.2 and every command was checked against `--help`. Messages are quoted as printed.

## Language errors

| Symptom | Cause | Command / fix |
|---|---|---|
| `error: syntax error, unexpected '}', expecting ';'` | Missing `;` after an attribute | `nix-instantiate --parse file.nix` points at the line |
| `error: undefined variable 'foo'` | Name not in scope: typo, missing `let`, missing function argument, `with` not covering it | `nix eval --expr` with the smallest reproducer; see [Language errors](/learn/language-errors) |
| `error: attribute 'b' missing` plus `Did you mean a?` | Lookup on a set without that key | Use `set.b or default`, or `set ? b` to test |
| `error: infinite recursion encountered` | A value defined in terms of itself with no lazy escape, for example `let a = b; b = a; in a`, or `final.x` used while defining `x` in an overlay | Use `prev.x` in overlays; check `rec` sets for self-reference |
| `… while evaluating a path segment` on `"x" + 1` | String plus integer. Nix does not coerce | `"x" + toString 1` |
| `error: function 'anonymous lambda' called with unexpected argument 'doCheck'` | `.override` given a name that is not a function parameter | Use `.overrideAttrs`; list parameters with `builtins.attrNames pkg.override.__functionArgs` |
| `evaluation warning: ... was overridden with 'version' but not 'src'` | `overrideAttrs` changed `version` only | Override `src` too, with `finalAttrs.version` |

Reproduce language errors fast:

```sh
nix eval --expr '{ a = 1; }.b'
```

```text
error: attribute 'b' missing
       at «string»:1:1:
            1| { a = 1; }.b
             | ^
       Did you mean a?
```

## Flake errors

| Symptom | Cause | Command / fix |
|---|---|---|
| `error: Path 'shell.nix' in the repository "..." is not tracked by Git.` | File exists but git does not know it; flakes copy only tracked files | `git add -N shell.nix` (the message prints the exact command) |
| `warning: Git tree '...' is dirty` | Uncommitted changes. Not an error, but `self.rev` is unset and `Last modified` shows 1970 | Commit, or ignore while iterating |
| `error: flake '...' requires lock file changes but they're not allowed due to '--no-update-lock-file'` | `flake.nix` declares an input the lock does not have, and writes were forbidden (CI) | `nix flake lock` locally and commit `flake.lock` |
| `warning: 'bogus' does not match any input of this flake` | `nix flake update bogus` with a wrong input name | `nix flake metadata` lists the real names |
| `warning: not writing modified lock file ... Added input 'nixpkgs'` with no `inputs.nixpkgs` declared | An `outputs` argument was turned into an implicit registry input | Declare `inputs.nixpkgs.url` explicitly |
| `error: app 'apps.x86_64-linux.default' lacks attribute 'program'` | A derivation was placed under `apps` | `{ type = "app"; program = "${pkg}/bin/x"; }` or move it to `packages` |
| `error: overlay is not a function, but a set instead` | `overlays.<name>` got a per-system level, usually from `eachDefaultSystem` | Move `overlays` outside the per-system wrapper |
| `does not provide attribute 'packages.x86_64-linux.foo', 'legacyPackages...` | Attribute path does not exist in the flake | `nix flake show` to see what exists; check the system string |
| Fetching nixpkgs takes minutes | A new rev or a new URL form (`github:` vs channel tarball) means a fresh ~40 MB download | Expected on a slow line; `nix flake metadata nixpkgs` shows what is cached |

## Build failures

| Symptom | Cause | Command / fix |
|---|---|---|
| `hash mismatch in fixed-output derivation` with `specified:` and `got:` | Wrong or placeholder hash | Paste the `got:` value. Intentional with `lib.fakeHash`; see [Fetchers and hashes](/learn/fetchers-and-hashes) |
| Version bumped, output unchanged, no error | Hash left unchanged; FOD path already in store, so no fetch | Set hash to `lib.fakeHash` together with the version |
| `bash: line 1: mkdir: command not found` (raw `builtins.derivation`) | No `PATH` in a raw derivation | Add `PATH = "${pkgs.coreutils}/bin";` or use `runCommand` |
| `setup: line N: hello: command not found`, exit 127 | Tool in `buildInputs` with `strictDeps`, or missing entirely | Move it to `nativeBuildInputs` |
| `curl: (6) Could not resolve host: example.com` | Network inside the sandbox | Use a fetcher (FOD). Never `sandbox = false` |
| `failed to produce output path for output 'out'` | Builder exited 0 but never wrote `$out` | Write to `$out`; cwd is discarded |
| `builder failed with exit code 1` and nothing useful | Log not shown | `nix build -L`, or `nix log <drv>` afterwards |
| `error: build log of '...' is not available` | Path came from the binary cache, never built here | `nix build --rebuild <installable>` to build locally, then `nix log` |
| Need to see the files a failed build left behind | Scratch dir deleted by default | `nix build --keep-failed ...` prints `note: keeping build directory "..."` |
| Need to run one phase by hand | Build env not loaded | `nix develop -f default.nix --unpack`, then `cd src`, then `--build` / `--install`; `--phase <name>` for any other |
| Suspect non-determinism | Timestamps, random order | `nix build --rebuild`; silence means identical |
| "Why is X in my closure?" | Runtime reference | `nix why-depends <pkg> <dep>.out`; multi-output packages need an explicit output |
| Closure too large | Dev outputs or docs pulled in | `nix path-info -Sh <pkg>`; `nix run nixpkgs#nix-tree -- <path>` |

Reproduce the two most common ones:

```sh
nix build --impure --no-link -L --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in pkgs.runCommand "needs-jq" { } "jq --version > $out"'
```

```text
needs-jq> /build/.attr-0l2nkwhif96f51f4amnlf414lhl4rv9vh8iffyp431v6s28gsr90: line 1: jq: command not found
       Reason: builder failed with exit code 127.
```

```sh
nix build --impure --no-link --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in pkgs.fetchurl { url = "https://ftp.gnu.org/gnu/hello/hello-2.12.3.tar.gz"; hash = pkgs.lib.fakeHash; }'
```

```text
error: hash mismatch in fixed-output derivation '/nix/store/x4cvsk81gjv31j34bf4d8gz537vy9dn6-hello-2.12.3.tar.gz.drv':
         specified: sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
            got:    sha256-DV9gFUOC/uELEUocNOeF2LH0kgc64tOm97FHaHs2aqA=
```

## Store issues

| Symptom | Cause | Command / fix |
|---|---|---|
| Disk nearly full | Old build results, old profile generations | `nix-collect-garbage --dry-run` to preview, then `nix store gc`. `nix store gc --max 5G` frees up to a limit |
| GC frees little | Live roots: profiles, `result` symlinks, direnv caches | `nix profile wipe-history` removes old generations; delete stale `result` links; `nix store gc --dry-run` |
| A profile upgrade broke a tool | Latest generation is bad | `nix profile history` to list, `nix profile rollback` to go back one |
| `path '...' is not valid` | Path referenced but not in the store (not yet fetched, or GC'd) | `nix build --no-link <installable>` to fetch; `nix store verify --all` if corruption is suspected |
| Store path corrupted | Disk error or manual edit under `/nix/store` | `nix store verify --all`, then `nix store repair <path>` |
| `nix flake metadata nixpkgs` shows a `Path` that does not exist on disk | Nix 2.35 may report a path for a tree not yet materialised | `nix flake prefetch nixpkgs` downloads it into the store |

Preview garbage collection without deleting anything:

```sh
nix-collect-garbage --dry-run
```

```text
determining live/dead paths...
6318 store paths would be deleted
```

## First response checklist

1. Read the **last** `error:` line, then work upward through the `… while` frames.
2. For builds, rerun with `-L`. For flakes, run `nix flake show` and `git status`.
3. Shrink to a one-line `nix eval --expr` reproducer.
4. If a builder's behaviour is unclear, read its source: `nix eval --raw nixpkgs#<pkg>.meta.position`, and the hooks under `pkgs/build-support/`.
