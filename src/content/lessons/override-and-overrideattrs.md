---
title: override and overrideAttrs
stage: 4
order: 24
slug: override-and-overrideattrs
summary: Change a package's inputs with .override and its build recipe with .overrideAttrs, and know which one a change needs.
minutes: 13
---

## Why this matters

You will rarely write a package from scratch. You will take `pnpm_10` and make it use Node 22, take a tool and disable its slow tests, or bump a version before nixpkgs does. Two methods cover all of that. Picking the wrong one is the most common beginner confusion in nixpkgs, and the error messages do not help.

## Concept

### Two layers, two methods

A nixpkgs package is a function applied to its dependencies, whose result is a `mkDerivation` call:

```nix
{ lib, stdenv, fetchurl, gettext }:
stdenv.mkDerivation {
  pname = "example";
  version = "1.0";
  src = fetchurl {
    url = "https://example.com/example-1.0.tar.gz";
    hash = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
  };
  buildInputs = [ gettext ];
}
```

- `.override { ... }` re-applies the **outer function** with different arguments: `lib`, `stdenv`, `fetchurl`, `gettext`. It changes **what the package is built with**.
- `.overrideAttrs (old: { ... })` changes the **attribute set passed to mkDerivation**: `version`, `src`, `buildInputs`, `doCheck`, phases. It changes **how it is built**.

The arguments `.override` accepts are exactly the function's parameters. Verified for `hello`:

```sh
nix eval --impure --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in builtins.attrNames pkgs.hello.override.__functionArgs'
```

```text
[ "callPackage" "fetchurl" "gettext" "gnulib" "hello" "lib" "stdenv" "testers" "versionCheckHook" ]
```

If the thing you want to change is not in that list, you need `overrideAttrs`.

### `.override` in practice

`pnpm_10` is built against the default Node. For a Node 22 project:

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
pkgs.pnpm_10.override { nodejs-slim = pkgs.nodejs-slim_22; }
```

```text
{ default = "24.21.0"; slim22 = "22.23.3"; withSlim = "22.23.3"; }
```

(Output from evaluating `.nodejs-slim.version` on `pnpm_10`, on `nodejs-slim_22`, and on the overridden pnpm.) The argument name `nodejs-slim` comes from `pkgs.pnpm_10.override.__functionArgs`; passing `nodejs` instead prints a deprecation warning.

### `.overrideAttrs` in practice

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
pkgs.hello.overrideAttrs (old: {
  doCheck = false;
  postInstall = (old.postInstall or "") + ''
    echo "patched locally" > $out/NOTE
  '';
})
```

`old` is the original attribute set. Appending to `old.postInstall` instead of replacing it keeps whatever the package already did. Verified: `doCheck` goes from `true` to `false`.

### The `finalAttrs` pattern

Modern packages are written as `mkDerivation (finalAttrs: { ... })` so that `src` can reference `finalAttrs.version`. `overrideAttrs` accepts a two-argument function for the same reason:

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
pkgs.hello.overrideAttrs (finalAttrs: old: {
  version = "9.9";
  src = pkgs.fetchurl {
    url = "mirror://gnu/hello/hello-${finalAttrs.version}.tar.gz";
    hash = pkgs.lib.fakeHash;
  };
})
```

```text
"hello-9.9"
```

(`.name` after the override.) `finalAttrs.version` is the **overridden** value, so `src` follows the bump. With a one-argument `old:` you would have to write the version twice.

### `passthru`

Attributes under `passthru` are attached to the result but not to the build, so changing them does not rebuild anything. `hello.passthru` contains `tests`; `pnpm_10.passthru` exposes `fetchDeps` and `configHook`. Use `passthru` for test suites, helper functions and metadata that other packages read.

## Try it

```sh
nix eval --impure --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in (pkgs.hello.overrideAttrs (final: prev: { version = "9.9"; })).name'
```

```text
evaluation warning: hello-2.12.3 was overridden with `version` but not `src` at <unknown file>:<unknown line>:<unknown column>.

                    This is most likely not what you want. In order to properly change the version of a package, override
                    both the `version` and `src` attributes:

                    hello.overrideAttrs (oldAttrs: rec {
                      version = "1.0.0";
                      src = pkgs.fetchurl {
                        url = "mirror://gnu/hello/hello-${version}.tar.gz";
                        hash = "...";
                      };
                    })

                    (To silence this warning, set `__intentionallyOverridingVersion = true` in your `overrideAttrs` call.)
"hello-9.9"
```

nixpkgs itself warns you about the half-done version bump. Then confirm `.override` cannot touch build attributes:

```sh
nix eval --impure --expr 'let pkgs = import (builtins.getFlake "nixpkgs") { }; in (pkgs.hello.override { doCheck = false; }).name'
```

```text
error: function 'anonymous lambda' called with unexpected argument 'doCheck'
```

`doCheck` is not a parameter of the `hello` function. The message names the argument; that is your cue to switch to `overrideAttrs`.

## Exercise

Produce a `hello` whose `pname` is `hello-quiet` and whose `doCheck` is `false`, in one `overrideAttrs` call, and evaluate its `.name` and `.doCheck`.

<details>
<summary>Solution</summary>

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
  quiet = pkgs.hello.overrideAttrs (old: {
    pname = "hello-quiet";
    doCheck = false;
  });
in
{
  name = quiet.name;
  doCheck = quiet.doCheck;
}
```

Expected: `{ doCheck = false; name = "hello-quiet-2.12.3"; }`. Both are plain `mkDerivation` attributes, so `overrideAttrs` is the right tool.

</details>

## Trap

Using `.override` to change `src` or `version`. They are not function arguments, so you get an error about an unexpected argument, or worse, on packages that happen to take `version` as a parameter, a silent no-op on `src`. Rule: dependency names (`nodejs`, `openssl`, `stdenv`) are `.override`; everything that appears inside the `mkDerivation { }` braces is `.overrideAttrs`.

## Checkpoint

```quiz
[
  {"q": "Which method changes the Node version pnpm_10 is built with?", "options": [".overrideAttrs", ".override", ".overrideDerivation", "passthru"], "answer": 1, "why": "nodejs-slim is a function argument of the pnpm package, so .override re-applies the function with a different one."},
  {"q": "Why prefer `overrideAttrs (finalAttrs: old: { ... })` when bumping a version?", "options": ["It is faster", "finalAttrs.version is the overridden value, so src can reuse it", "old is read-only", "It silences warnings"], "answer": 1, "why": "finalAttrs is the fixpoint of the final attribute set, so one edit updates both version and src."},
  {"q": "Changing a `passthru` attribute does what to the build?", "options": ["Forces a rebuild", "Nothing; passthru is not part of the derivation", "Changes the store path", "Fails evaluation"], "answer": 1, "why": "passthru attaches values to the result without entering the derivation inputs."}
]
```
