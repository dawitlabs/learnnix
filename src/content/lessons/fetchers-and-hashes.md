---
title: Fetchers and hashes
stage: 4
order: 23
slug: fetchers-and-hashes
summary: Fetch sources with fetchurl and fetchFromGitHub, get the right SRI hash, and explain why network access needs a hash.
minutes: 14
---

## Why this matters

Every package starts with a download, and the sandbox has no network. The way out is the **fixed-output derivation**: you promise the hash of what comes back, and Nix allows the fetch. Getting that hash is the single most repeated chore in packaging. There is a two-step trick that makes it painless, and a trap that silently gives you stale sources.

## Concept

### Fixed-output derivations

A normal derivation's output path is computed from its inputs. A fixed-output derivation (FOD) declares `outputHash` up front; the output path is computed from the **hash of the content**. Because the result is pinned by content, Nix lets the builder use the network. If the download does not match, the build fails. The source URL is not part of the identity: two URLs with identical content produce one store path.

Look at `hello`'s source:

```sh
nix derivation show nixpkgs#hello.src | jq '.derivations[] | {builder, outputs}'
```

```text
{
  "builder": "/nix/store/10dxp0qxqxxsyiljrh2kp0xqhz6arhcx-bash-5.3p15/bin/bash",
  "outputs": {
    "out": {
      "hash": "sha256-DV9gFUOC/uELEUocNOeF2LH0kgc64tOm97FHaHs2aqA=",
      "method": "flat"
    }
  }
}
```

`method: flat` means the hash is over a single file. `fetchFromGitHub` unpacks the tarball, so its hash is over the directory as a NAR archive:

```sh
nix derivation show nixpkgs#turso-cli.src | jq '.derivations[] | .outputs'
```

```text
{
  "out": {
    "hash": "sha256-B1sm1RBJneSoNYUrXTXMzB7n+UAmn6RlFtV1BZpOdZM=",
    "method": "nar"
  }
}
```

That is why the hash of a GitHub tarball URL is not the hash `fetchFromGitHub` wants.

### The fetchers

```nix
{ fetchurl, fetchFromGitHub, fetchgit }:
{
  tarball = fetchurl {
    url = "https://ftp.gnu.org/gnu/hello/hello-2.12.3.tar.gz";
    hash = "sha256-DV9gFUOC/uELEUocNOeF2LH0kgc64tOm97FHaHs2aqA=";
  };

  repo = fetchFromGitHub {
    owner = "tursodatabase";
    repo = "turso-cli";
    tag = "v1.0.32";
    hash = "sha256-hRmDoyj6rdqB+P0nAS+Xxg/6gUjxJm3qetiSGn+Nuaw=";
  };

  anyGit = fetchgit {
    url = "https://git.example.com/me/tool.git";
    rev = "0123456789abcdef0123456789abcdef01234567";
    hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  };
}
```

- `fetchurl` — one file, hashed flat.
- `fetchFromGitHub` — a GitHub tarball, unpacked, hashed as NAR. Use `tag` for tags, `rev` for commits.
- `fetchgit` — real `git clone` for any host, `rev` must be a commit.

Use `hash` with an SRI string (`sha256-...base64`). The older `sha256 = "base32..."` form still works but is legacy.

### SRI and the `nix hash` commands

Verified on Nix 2.35.2 (`nix hash --help`): `nix hash file`, `nix hash path`, `nix hash convert`. The `to-base32`/`to-sri` subcommands are deprecated in favour of `convert`.

```sh
printf 'hello\n' > f.txt
nix hash file f.txt
nix hash file --base32 f.txt
nix hash convert --hash-algo sha256 --to sri 00xyyr3fi8l6hb839bv3f7yb86yjv7xi1cgh1xnhipym4asvb4aq
```

```text
sha256-WJG1tSLV3whtD/CxEPvZ0hu0/HFjrzTQgoai6Eb2vgM=
00xyyr3fi8l6hb839bv3f7yb86yjv7xi1cgh1xnhipym4asvb4aq
sha256-WJG1tSLV3whtD/CxEPvZ0hu0/HFjrzTQgoai6Eb2vgM=
```

Same hash, two encodings. `nix hash path <dir>` hashes a directory the NAR way, matching `method: nar`.

### The fake-hash trick

You rarely compute a hash yourself. Put `lib.fakeHash` in, build, copy the real hash from the error:

```sh
nix build --impure --no-link --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in pkgs.fetchurl { url = "https://ftp.gnu.org/gnu/hello/hello-2.12.3.tar.gz"; hash = pkgs.lib.fakeHash; }'
```

```text
error: hash mismatch in fixed-output derivation '/nix/store/x4cvsk81gjv31j34bf4d8gz537vy9dn6-hello-2.12.3.tar.gz.drv':
         specified: sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
            got:    sha256-DV9gFUOC/uELEUocNOeF2LH0kgc64tOm97FHaHs2aqA=
```

`lib.fakeHash` is the all-zero SRI string; `lib.fakeSha256` is the base32 equivalent for the legacy attribute. Paste the `got:` line. This works for `vendorHash`, `npmDepsHash` and `cargoHash` too, see [Language builders](/learn/language-builders).

## Try it

The legacy prefetcher is still installed and prints base32:

```sh
nix-prefetch-url https://ftp.gnu.org/gnu/hello/hello-2.12.3.tar.gz
```

```text
183a6rxnhixiyykd7qis0y9g9cfqhpkk872a245y3zl28can0pqd
```

Convert it and compare with the `fetchurl` hash above:

```sh
nix hash convert --hash-algo sha256 --to sri 183a6rxnhixiyykd7qis0y9g9cfqhpkk872a245y3zl28can0pqd
```

```text
sha256-DV9gFUOC/uELEUocNOeF2LH0kgc64tOm97FHaHs2aqA=
```

Identical. Prefer the fake-hash trick: it uses the same fetcher with the same hashing method, so there is no flat-vs-NAR confusion.

## Exercise

Without downloading anything new, prove that `fetchFromGitHub`'s hash is a NAR hash: find the store path of `turso-cli`'s source with `nix eval --raw nixpkgs#turso-cli.src`, then (if that path exists on disk) run `nix hash path` on it and compare with `nix eval nixpkgs#turso-cli.src.outputHash`.

<details>
<summary>Solution</summary>

```sh
nix eval nixpkgs#turso-cli.src.outputHash
nix eval nixpkgs#turso-cli.src.outputHashMode
```

```text
"sha256-B1sm1RBJneSoNYUrXTXMzB7n+UAmn6RlFtV1BZpOdZM="
"recursive"
```

`recursive` is the attribute-level name for `method: nar`. If the source is not in your store, `nix hash path` cannot run; `nix build --no-link nixpkgs#turso-cli.src` would fetch it (a few MB) and then `nix hash path $(nix eval --raw nixpkgs#turso-cli.src)` prints the same SRI string.

</details>

## Trap

You bump `tag = "v1.0.32"` to `v1.0.33` and forget the hash. Nothing fails. The output path of a FOD depends only on the hash, that path already exists in the store from the old version, so Nix skips the fetch and builds **the old source** under the new name. Recognise it by a version bump that changes nothing in the result. Fix: change the hash to `lib.fakeHash` at the same time as the tag, every time, then paste the new `got:` value.

## Checkpoint

```quiz
[
  {"q": "Why may a fixed-output derivation access the network?", "options": ["It runs outside the sandbox", "Its result is verified against a declared content hash", "fetchurl is trusted", "Network is always allowed"], "answer": 1, "why": "Because the output is pinned by hash, where the bytes came from does not affect reproducibility."},
  {"q": "What does `lib.fakeHash` do?", "options": ["Disables hash checking", "Is an all-zero SRI hash that forces a mismatch error showing the real hash", "Computes the hash lazily", "Downloads without caching"], "answer": 1, "why": "The build fails with specified/got lines and you copy the got value."},
  {"q": "You change `tag` but keep the old hash. What happens?", "options": ["Hash mismatch error", "Nix fetches the new tag", "Nix reuses the existing store path for that hash, so you build the old source", "Evaluation error"], "answer": 2, "why": "FOD output paths depend only on the hash; an existing path means no fetch is attempted."}
]
```
