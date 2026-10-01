---
title: Glossary
order: 6
summary: Forty-odd Nix terms in one or two sentences each, in the order you meet them.
---

**store**
`/nix/store`. A directory where every package, config file and build input lives under a hash-prefixed name. World-readable, immutable, shared by all users.

**store path**
One entry in the store, `/nix/store/<hash>-<name>`. The hash covers everything that went into producing it.

**derivation**
A build recipe: inputs, builder, environment, output names. Pure data; building it produces outputs.

**.drv**
The on-disk serialisation of a derivation, itself a store path. `nix derivation show` prints it as JSON.

**output**
A store path produced by building a derivation. Most have one, `out`; some split into `bin`, `dev`, `doc`.

**closure**
A store path plus every path it references, transitively. What `nix copy` ships and what a system needs to run.

**fixed-output derivation**
A derivation whose output hash is declared up front, so the sandbox may use the network. All fetchers are this.

**substituter**
A store Nix can download already-built paths from instead of building. `cache.nixos.org` is the default.

**binary cache**
A substituter served over HTTP or S3. Same thing from the server's side.

**channel**
The pre-flakes way to pin nixpkgs: a mutable named pointer updated with `nix-channel --update`. Avoid in new work.

**flake**
A directory with `flake.nix` declaring `inputs` and `outputs` in a fixed schema, with a lock file. The unit of reproducible evaluation.

**lock file**
`flake.lock`. Exact revision and hash of every input. Commit it; it is the upgrade history.

**registry**
A name-to-flake map so `nixpkgs#hello` resolves without a URL. `nix registry list`.

**profile**
A symlink chain pointing at the current generation of installed things: `~/.nix-profile`, `/nix/var/nix/profiles/system`.

**generation**
One numbered version of a profile. Switching creates a new one; rollback points at an old one.

**garbage collection**
Deleting store paths not reachable from any GC root. `nix-collect-garbage -d` also deletes old generations first.

**root**
A GC root: a symlink under `/nix/var/nix/gcroots` that keeps a path and its closure alive. Profiles and `result` links are roots.

**overlay**
A function `final: prev: { ... }` that modifies the package set. How you change a package for everything that depends on it.

**override**
`pkg.override { arg = ...; }` changes the arguments passed to a package's function, such as a dependency.

**overrideAttrs**
`pkg.overrideAttrs (old: { ... })` changes the attributes of the derivation itself, such as `patches` or `version`.

**stdenv**
The standard build environment: a shell, coreutils, a compiler, and the phases framework behind `mkDerivation`.

**phase**
One step of a `mkDerivation` build: `unpackPhase`, `patchPhase`, `configurePhase`, `buildPhase`, `checkPhase`, `installPhase`, `fixupPhase`. Each is overridable.

**nativeBuildInputs**
Dependencies that run at build time on the build machine: compilers, `pkg-config`, `makeWrapper`.

**buildInputs**
Dependencies the result links against or needs at runtime: libraries.

**propagatedBuildInputs**
`buildInputs` that are also exposed to anything depending on this package. Common in Python and Haskell.

**module**
An attrset or function with `options`, `config`, `imports`. The unit of NixOS and home-manager configuration.

**option**
A declared, typed setting. Declared once with `mkOption`, defined anywhere, merged by type.

**fixpoint**
A value defined in terms of itself and resolved lazily. `config` in a module is one: every module sees the final result.

**laziness**
Nix evaluates an expression only when its value is needed. Makes fixpoints possible and errors appear late.

**impure**
Evaluation that reads something outside the inputs: environment variables, `builtins.currentSystem`, an unlocked flake reference. `--impure` allows it.

**pure**
Evaluation whose result depends only on the inputs. Flakes are pure by default.

**sandbox**
The isolated environment builds run in: no network, no `$HOME`, only declared inputs visible. Why builds are reproducible.

**hash (SRI)**
`sha256-<base64>`. The format Nix uses for `hash =` in fetchers and in lock files.

**NAR**
Nix ARchive. The serialisation of a store path used for hashing and for binary caches.

**nix-daemon**
The privileged process that performs builds and store writes on behalf of users. Multi-user installs talk to it over a socket.

**activation**
Running a built system or home configuration: switching symlinks, writing `/etc`, restarting units. `switch-to-configuration` and home-manager's `activate` script.

**stateVersion**
`system.stateVersion` and `home.stateVersion`. Records which release's defaults for on-disk state you started with. Set once, never bump.

**home-manager**
A module system for one user's `$HOME`: dotfiles, packages, user services. Standalone or as a NixOS module.

**nixpkgs**
The repository holding every package definition, `lib`, and the NixOS modules. One git repo, one flake.

**NixOS**
A Linux distribution where the whole system is one derivation built from nixpkgs modules.

**flake-parts**
A library for writing `flake.nix` as modules, so outputs are declared per system without boilerplate.

**direnv**
A shell hook that loads an environment when you `cd` into a directory with `.envrc`.

**nix-direnv**
A direnv extension that caches a flake dev shell so entering the directory is instant and survives garbage collection.

**callPackage**
`pkgs.callPackage ./file.nix { }` calls a function with arguments pulled from `pkgs` by name. How every package in nixpkgs is instantiated.

**mkShell**
A derivation that is never built, only entered: `nix develop` puts its `packages` on `PATH`.

**runCommand**
`pkgs.runCommand "name" { } "shell script"` makes a derivation from a script. The smallest useful builder.

**writeShellApplication**
A builder for a shell script with `runtimeInputs` on `PATH` and shellcheck at build time. Use it instead of `writeShellScriptBin` for anything non-trivial.
