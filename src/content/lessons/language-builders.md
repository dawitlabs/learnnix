---
title: Language builders
stage: 4
order: 26
slug: language-builders
summary: Package Node, pnpm, Go and Rust projects with nixpkgs builders, and know when a dev shell is the better answer.
minutes: 15
---

## Why this matters

Your stack is Node with pnpm, some Go, some Rust. nixpkgs has a builder for each. All of them solve the same hard problem, dependencies fetched during the build, the same way: a **fixed-output derivation** for the dependency set with one hash you maintain. [Fetchers and hashes](/learn/fetchers-and-hashes) applies throughout.

## Concept

### The shared idea

`npm install`, `pnpm install`, `go mod download` and `cargo fetch` all need the network, which the sandbox denies. Each builder splits the build in two:

1. A FOD that runs the package manager's fetch step and is pinned by `npmDepsHash` / `vendorHash` / `cargoHash`.
2. The real build, offline, with the fetched dependencies wired in.

Change the lockfile, and the hash must change. Use `lib.fakeHash`, read the `got:` line.

### Node: `buildNpmPackage`

Verified to exist (`builtins.typeOf pkgs.buildNpmPackage` is `set`, a callable functor). Real package from nixpkgs, `coc-docker`:

```nix
{ lib, buildNpmPackage, fetchFromGitHub }:
buildNpmPackage (finalAttrs: {
  pname = "coc-docker";
  version = "1.0.2";

  src = fetchFromGitHub {
    owner = "josa42";
    repo = "coc-docker";
    tag = "v${finalAttrs.version}";
    hash = "sha256-orSwQys+w2TKLau0gROyKh54vq7AwlVLsoU1EzALIDQ=";
  };

  npmDepsHash = "sha256-ow9viEFfyBUM2yDa63+pQCg6R5cAmznanqfI131fRxc=";

  meta.description = "Docker language server extension for coc.nvim";
})
```

It requires a `package-lock.json` in `src`. Default phases run `npm ci` offline, then `npm run build`, then install the package into `$out/lib/node_modules`. `npmBuildScript` changes the script name; `dontNpmBuild = true` skips it.

### pnpm: `fetchPnpmDeps` + `pnpmConfigHook`

What exists in the current nixpkgs, probed on 2026-10-01:

- `pkgs.pnpm` is **12.3.4** and has no `fetchDeps`/`configHook` attributes.
- `pkgs.pnpm_10` (10.34.5) and `pkgs.pnpm_11` (11.27.0) carry `fetchDeps` and `configHook` in `passthru`, but `pnpm.fetchDeps` prints a deprecation warning pointing at the top-level `pkgs.fetchPnpmDeps`.
- `pkgs.pnpm_9` was removed (EOL 2026-04-30).
- `fetchPnpmDeps` requires `fetcherVersion`; versions 1 and 2 were removed in 26.11, so use `3` or `4`.

Verify: `nix eval --impure --expr 'let pkgs = import (builtins.getFlake "nixpkgs") {}; in pkgs.fetchPnpmDeps.__functionArgs'`.

Real package, `svelte-language-server`, trimmed:

```nix
{ lib, stdenv, fetchFromGitHub, fetchPnpmDeps, pnpmConfigHook, pnpm_10, nodejs }:
let
  pnpm = pnpm_10;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "svelte-language-server";
  version = "0.18.4";

  src = fetchFromGitHub {
    owner = "sveltejs";
    repo = "language-tools";
    tag = "svelte-language-server@${finalAttrs.version}";
    hash = "sha256-FYM4pceGgYLDWhdoTCk2dLkcxhamkxBd2nBEtReEGAo=";
  };

  pnpmWorkspaces = [ "svelte-language-server..." ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src pnpmWorkspaces;
    inherit pnpm;
    fetcherVersion = 3;
    hash = "sha256-/EyaSBkzkArHbul9tFckVnUsejHUGF03KbmagMgAViE=";
  };

  nativeBuildInputs = [ nodejs pnpmConfigHook pnpm ];

  buildPhase = ''
    runHook preBuild
    pnpm run --filter=svelte-language-server... build
    runHook postBuild
  '';
})
```

There is no `buildPnpmPackage`. You write `mkDerivation` yourself: `pnpmConfigHook` runs `pnpm install --offline` from `pnpmDeps` before your `buildPhase`. The `pnpm` you pass must match the lockfile's major version.

### Go: `buildGoModule`

Real package, `turso-cli`, trimmed:

```nix
{ lib, buildGoModule, fetchFromGitHub }:
buildGoModule (finalAttrs: {
  pname = "turso-cli";
  version = "1.0.32";

  src = fetchFromGitHub {
    owner = "tursodatabase";
    repo = "turso-cli";
    tag = "v${finalAttrs.version}";
    hash = "sha256-hRmDoyj6rdqB+P0nAS+Xxg/6gUjxJm3qetiSGn+Nuaw=";
  };

  vendorHash = "sha256-wutbVEWWoTdgwtG6IXgCYEGn/rdmaPbLGcFeCTS2VNE=";

  ldflags = [ "-s" "-X=github.com/tursodatabase/turso-cli/internal/cmd.version=v${finalAttrs.version}" ];
})
```

`vendorHash` pins the `go mod vendor` output. `vendorHash = null` means the repo already vendors its deps.

### Rust: `rustPlatform.buildRustPackage`

`ripgrep` in nixpkgs uses `cargoHash = "sha256-AqizStE9ICd6mNDZWdeXg6dHuTiY+B0TNauQQYWUa84="`. The alternative is `cargoLock.lockFile = ./Cargo.lock`, which needs no hash because Nix reads the lockfile and fetches each crate as its own FOD. Use `cargoLock` for your own projects where `Cargo.lock` is in the repo; use `cargoHash` when packaging someone else's.

### When not to package

Packaging means every dependency change costs a hash update and a full rebuild. For a SvelteKit app deployed to Vercel that is pure overhead: use a dev shell from [Dev shells in depth](/learn/dev-shells-deep) and let pnpm own `node_modules`. Package when a NixOS service, a Home Manager program or another flake must consume the binary. Go and Rust CLIs are cheap to package; a web app rarely is.

## Try it

Read the pinned dependency hashes without building anything:

```sh
nix eval nixpkgs#coc-docker.npmDeps.outputHash
nix eval nixpkgs#svelte-language-server.pnpmDeps.outputHash
nix eval nixpkgs#turso-cli.goModules.outputHash
nix eval nixpkgs#ripgrep.cargoDeps.name
```

```text
"sha256-ow9viEFfyBUM2yDa63+pQCg6R5cAmznanqfI131fRxc="
"sha256-/EyaSBkzkArHbul9tFckVnUsejHUGF03KbmagMgAViE="
"sha256-4OIJVL3N2mWOw7ZDP4xFCxa9zmUTPCA8N79TVoi1lys="
"ripgrep-15.2.0-vendor"
```

The Go hash differs from the listing above because the `nixpkgs` registry entry resolves to the `nixpkgs-unstable` channel (turso-cli 1.0.31) while the listing is from the `nixos-unstable` branch (1.0.32). Same package, two nixpkgs commits.

## Exercise

Write a `buildGoModule` call for a hypothetical Go CLI at `github:you/tool` tag `v0.1.0`, with both hashes set to `lib.fakeHash`, as a function taking `{ lib, buildGoModule, fetchFromGitHub }`. Check it parses. Describe the two-step hash procedure you would follow.

<details>
<summary>Solution</summary>

```nix
{ lib, buildGoModule, fetchFromGitHub }:
buildGoModule (finalAttrs: {
  pname = "tool";
  version = "0.1.0";

  src = fetchFromGitHub {
    owner = "you";
    repo = "tool";
    tag = "v${finalAttrs.version}";
    hash = lib.fakeHash;
  };

  vendorHash = lib.fakeHash;
})
```

Build once: the `src` FOD fails first, paste its `got:` hash. Build again: the vendor FOD fails, paste that one. Two builds, two hashes, done. For a local project, `src = ./.;` skips the first step.

</details>

## Trap

Changing `package-lock.json` or `go.sum` and leaving `npmDepsHash` / `vendorHash` alone. Same mechanism as the stale-source trap: if the old dependency output already exists in your store, Nix reuses it and the build fails later with a confusing "missing module" error, or succeeds with old versions. Recognise it by dependency errors right after a lockfile change. Reset the hash to `lib.fakeHash` whenever the lockfile changes.

## Checkpoint

```quiz
[
  {"q": "What is `npmDepsHash` the hash of?", "options": ["package.json", "The fixed-output derivation holding the fetched npm dependencies", "The final package", "node_modules on your machine"], "answer": 1, "why": "Builders fetch dependencies in a separate FOD pinned by this hash, then build offline."},
  {"q": "Which attribute does the current pnpm fetcher require that older code omitted?", "options": ["pnpmLock", "fetcherVersion", "nodeVersion", "offline"], "answer": 1, "why": "fetchPnpmDeps throws unless fetcherVersion is set; versions 1 and 2 were removed in nixpkgs 26.11."},
  {"q": "When is a dev shell better than packaging a SvelteKit app?", "options": ["Never", "When the app is deployed by a platform like Vercel and does not need a Nix-built artifact", "Only on macOS", "When the app has no dependencies"], "answer": 1, "why": "Packaging adds a hash update and rebuild per dependency change with no benefit if nothing consumes the Nix build."}
]
```
