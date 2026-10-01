---
title: The Nix store
stage: 1
order: 3
slug: the-nix-store
summary: Read a store path, compute a package's closure, and reclaim disk space without breaking anything you use.
minutes: 15
---

## Why this matters

Everything in Nix is a store path: packages, dev shells, flake sources, even nixpkgs itself. Disk usage grows fast on a slow line where re-downloading hurts. Knowing what is safe to delete, and what keeps a path alive, is the difference between "Nix ate 40 GB" and a store you control.

## Concept

### Store paths

`/nix/store` is one flat directory. Every entry is `<hash>-<name>`:

```text
/nix/store/5z2yp3ysx8476c8g5w25b0smlgkjvaq3-hello-2.12.3
```

The hash covers every input to the build. The name is cosmetic. Inside is a normal Unix tree:

```sh
ls /nix/store/5z2yp3ysx8476c8g5w25b0smlgkjvaq3-hello-2.12.3
```

```text
bin
share
```

### Immutability

The store is owned by root, mode `drwxrwxr-t`, written only by the daemon. Once a path exists it is never modified. Upgrading means a new path appears; the old one stays until garbage collected.

```sh
touch /nix/store/x
```

```text
touch: cannot touch '/nix/store/x': Permission denied
```

This is why rollbacks are free: the old version was never deleted or overwritten.

### Closures

A path's **closure** is itself plus every store path it references, transitively. References are literal occurrences of other store paths inside the files (in RPATHs, shebangs, config). Nix scans for them after the build.

```sh
nix path-info -rSh nixpkgs#hello
```

```text
/nix/store/g60m3aky9f59wgy1gi0y06xwmbw19d6m-xgcc-16.2.0-libgcc	 197.5 KiB
/nix/store/jp8ql2fnd61xhvb4vsfp0bqwrzf16qrp-libunistring-1.4.2	   2.0 MiB
/nix/store/q0lbdx5yv93a3md74kjhm0v2kljjii89-libidn2-2.3.8     	   2.3 MiB
/nix/store/h4wfwic161kxrr74jlzla5lsm28hgary-glibc-2.44-25     	  36.5 MiB
/nix/store/5z2yp3ysx8476c8g5w25b0smlgkjvaq3-hello-2.12.3      	  36.7 MiB
```

`-r` is recursive (the closure), `-S` is closure size, `-h` is human readable. Five paths. `hello` itself is tiny; its closure is 36.7 MiB because it carries its own glibc. Nothing from `/usr/lib` is used. That is what makes the closure copyable to any Linux machine.

### Profiles and generations

A **profile** is a symlink to a store path that is itself a directory of symlinks. Yours:

```sh
ls -la ~/.local/state/nix/profiles/
```

```text
profile -> profile-1-link
profile-1-link -> /nix/store/5mcaq7843v0ixswhgbjdh6y9f2srk9wh-profile
```

Each `profile-N-link` is a **generation**. `nix profile add` builds a new `-profile` store path and bumps the symlink. Rollback is `nix profile rollback`: flip `profile` to the previous link. See the history:

```sh
nix profile history
```

```text
Version 1 (2026-09-25):
  flake:nixpkgs#legacyPackages.x86_64-linux.nixd: ∅ -> 2.9.2
  flake:nixpkgs#legacyPackages.x86_64-linux.nixfmt: ∅ -> 1.5.0
```

### GC roots

Garbage collection deletes every store path not reachable from a **GC root**. Roots are:

- every profile generation (all of them, not just the current)
- symlinks registered in `/nix/var/nix/gcroots/` (including `result` links from `nix build` and `.direnv` caches)
- paths a running process has open (temporary roots)

Reachable means "in the closure of a root". So old generations keep old closures alive. Delete generations first, then collect.

### The two GC commands

`nix store gc` deletes unreachable paths. It does not touch generations.

```sh
nix store gc --dry-run
```

```text
determining live/dead paths...
6879 store paths would be deleted
```

`nix-collect-garbage` (old CLI, still the standard tool) can also delete old generations first. `-d` deletes all non-current generations; `--delete-older-than 30d` keeps the last month. Then it runs the collector. Shown as text; it modifies state:

```text
nix-collect-garbage --delete-older-than 30d
```

Verify flags with a dry run before committing: `nix-collect-garbage --dry-run --delete-older-than 30d` printed `1525 store paths would be deleted` here. The number is lower than `nix store gc` because the two commands count differently; both are safe.

`nix store gc --max 1G` stops after freeing roughly that much. Useful on a slow line: free only what you need, keep the rest cached.

### Dedup

`nix store optimise` hard-links identical files across paths. Run it after a large GC. Read-only in effect on behaviour, saves disk.

## Try it

Inspect your own profile's closure size.

```sh
nix path-info -Sh ~/.nix-profile
```

Expected shape (your hash and size differ):

```text
/nix/store/5mcaq7843v0ixswhgbjdh6y9f2srk9wh-profile	 <size>
```

Then confirm `hello` is already in your store from [Why Nix](/learn/why-nix):

```sh
nix path-info nixpkgs#hello
```

```text
/nix/store/5z2yp3ysx8476c8g5w25b0smlgkjvaq3-hello-2.12.3
```

If it is not, `nix path-info` will substitute it. That is a download, not a build.

## Exercise

You ran `nix build nixpkgs#ripgrep` last week in `~/scratch`. Today `nix store gc` does not free ripgrep. Explain why, and what to delete so the next GC removes it.

<details>
<summary>Solution</summary>

`nix build` created `~/scratch/result`, a symlink into the store, and registered it under `/nix/var/nix/gcroots/auto/`. That makes ripgrep's closure reachable from a root. Delete the `result` symlink (`rm ~/scratch/result`), then run `nix store gc`. Nix detects the dangling auto-root and drops it.

Check roots: `ls -la /nix/var/nix/gcroots/auto/`.

</details>

## Trap

Running `nix-collect-garbage -d` right after a slow download. `-d` deletes every old generation, so a `nix profile rollback` is no longer possible, and anything only an old generation referenced is gone. On a 705 KB/s line, prefer `--delete-older-than 14d` or `nix store gc --max 2G`.

## Checkpoint

```quiz
[
  {"q": "What keeps a store path alive during garbage collection?", "options": ["Its modification time", "Being reachable from a GC root", "Having a name that matches an installed package", "Being larger than 1 MiB"], "answer": 1, "why": "GC deletes everything not in the closure of some root; roots are profile generations, registered symlinks and open paths."},
  {"q": "What does nix path-info -rSh print?", "options": ["Only the package path", "The package plus its runtime closure with sizes", "The build log", "The derivation source"], "answer": 1, "why": "-r walks references recursively, -S adds closure size, -h formats sizes for humans."},
  {"q": "Why can hello's closure run on any Linux machine?", "options": ["It is statically linked", "Its closure includes its own glibc from the store", "It uses /usr/lib from the host", "Nix compiles it per machine"], "answer": 1, "why": "Every runtime dependency, including glibc, is a store path inside the closure, so nothing from the host is needed."}
]
```
