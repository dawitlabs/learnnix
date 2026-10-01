---
title: Why Nix
stage: 1
order: 1
slug: why-nix
summary: Explain what problem Nix solves that pacman, mise and Docker do not, and name its three layers.
minutes: 10
---

## Why this matters

You already juggle three tools for one job: pacman for system packages, mise for Node versions per project, Docker when "works on my machine" fails. Each one solves a slice. Nix solves the whole problem with one idea, and you can use it on Arch today without replacing anything.

## Concept

### The problem: shared mutable paths

pacman installs into `/usr/bin`. One `node` binary, one version, global. mise fixes that for runtimes by swapping shims, but only for the tools mise knows about. Docker fixes it by shipping a whole filesystem, which is heavy and leaks nothing back to your editor.

The root cause is the same everywhere: packages are installed into shared paths, so two versions of the same thing cannot coexist, and nothing records exactly which inputs produced a given binary.

### The idea: the store

Nix installs every package into its own directory under `/nix/store`. The directory name starts with a hash of every input used to build it: source, dependencies, build script, compiler flags.

```text
/nix/store/5z2yp3ysx8476c8g5w25b0smlgkjvaq3-hello-2.12.3
```

Change any input and the hash changes, so you get a new directory. The old one is untouched. This gives you four things for free:

- **Coexistence.** Node 22 and Node 24 live side by side. Nothing conflicts.
- **Reproducibility.** Same inputs, same hash, same output. On your laptop, on CI, on a teammate's Mac.
- **Rollbacks.** Switching versions is switching a symlink. The previous version is still in the store.
- **No dependency hell.** A package's dependencies are part of its hash. Upgrading one program cannot break another.

The term for "a package plus everything it needs at runtime" is its **closure**. You will meet it in [The Nix store](/learn/the-nix-store).

### Compared to your current tools

| Tool | What it versions | Per project | Reproducible |
|---|---|---|---|
| pacman | system packages | no | no |
| mise | runtimes it has plugins for | yes | partly (version string only) |
| Docker | a whole filesystem image | yes | partly (base images drift) |
| Nix | any package, library, or shell | yes | yes, by construction |

mise pins `node 22`. Nix pins `node 22.23.3 built from this exact nixpkgs commit with these exact libc and OpenSSL`. That is the difference between a version label and a hash of the inputs.

### What Nix is NOT

- Not a replacement for pacman on Arch. They coexist. Nix never touches `/usr`.
- Not a container runtime. No isolation at runtime, no namespaces. It isolates builds, not processes.
- Not a Linux distribution, by default. NixOS exists, but Nix on Arch is just a package manager plus a language.
- Not fast to learn. The language has sharp edges. This course exists because of them.

### The three layers

1. **The Nix language.** A small, lazy, functional language used to describe packages and configuration. Stage 2 covers it.
2. **The Nix package manager.** The `nix` CLI, the store, profiles, and nixpkgs (the package collection, 28000+ attributes). Stage 1 covers it.
3. **NixOS.** A Linux distribution where the whole system is one Nix expression. Optional. Not covered here. home-manager gives you most of the benefit on Arch.

Keep the layers separate in your head. Most confusion online comes from mixing a language question with a NixOS question.

## Try it

Check what you have. This is read-only.

```sh
nix --version
nix config show | grep experimental-features
```

```text
nix (Nix) 2.35.2
experimental-features = fetch-tree flakes nix-command
```

Count what is already in your store from the install and earlier experiments.

```sh
ls /nix/store | wc -l
```

```text
4859
```

Your number will differ. The point: thousands of directories, each named by hash, none in `/usr`.

## Exercise

Without running anything, predict: if you install `hello` twice from two different nixpkgs versions, how many `hello` directories appear in `/nix/store`? Then verify your reasoning by reading one real store path and explaining each part of its name.

<details>
<summary>Solution</summary>

Two. Each nixpkgs version has different inputs (source hash, glibc version, build script), so the input hash differs and Nix creates a separate directory.

Reading a path:

```text
/nix/store/5z2yp3ysx8476c8g5w25b0smlgkjvaq3-hello-2.12.3
           └── 32-char hash of all inputs ──┘ └ name-version ┘
```

The hash is computed before the build, from the inputs. The `hello-2.12.3` part is for humans. Two paths with the same name but different hashes are different packages.

</details>

## Trap

Thinking "I installed Nix, so I should uninstall mise." Do not. Nix on Arch is additive. Keep mise until a Nix dev shell covers a project end to end (see [Dev shells](/learn/dev-shells)). Switching tools before you understand the replacement is how you end up with neither working.

## Checkpoint

```quiz
[
  {"q": "What determines the hash in a Nix store path?", "options": ["The file contents after the build", "All inputs: source, dependencies, build script", "The package name and version", "A random UUID assigned at install time"], "answer": 1, "why": "The hash is computed from every input before building, so different inputs always give a different path."},
  {"q": "Which statement about Nix on Arch is true?", "options": ["It replaces pacman", "It requires NixOS", "It installs under /nix and leaves /usr alone", "It isolates running processes like Docker"], "answer": 2, "why": "Nix is additive on Arch: everything lives in /nix/store and pacman keeps managing /usr."},
  {"q": "What is a package's closure?", "options": ["Its source tarball", "The package plus everything it needs at runtime", "Its build log", "The list of packages that depend on it"], "answer": 1, "why": "A closure is the full set of store paths a package references, which is what makes it self-contained and copyable."}
]
```
