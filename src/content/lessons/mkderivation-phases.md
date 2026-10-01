---
title: mkDerivation and phases
stage: 4
order: 22
slug: mkderivation-phases
summary: Package a source tree with stdenv.mkDerivation and control each build phase from unpack to fixup.
minutes: 15
---

## Why this matters

`stdenv.mkDerivation` is how nearly every package in nixpkgs is written, and it is what `buildNpmPackage` and `buildGoModule` wrap. Once you know the phase list you can read any `package.nix`, fix a broken build by overriding one phase, and understand what `nix develop` on a package gives you.

## Concept

### What stdenv adds to a raw derivation

[The derivation primitive](/learn/derivation-primitive) gave you bash and nothing else. `mkDerivation` sets `builder` to bash running a setup script that provides:

- a `PATH` with coreutils, findutils, sed, grep, tar, patch, and for `stdenv` also gcc, make and binutils;
- the **phase** runner `genericBuild`;
- setup hooks from every dependency (for example `pkg-config` teaching the build where libraries are);
- fixups: shebang patching, RPATH shrinking, stripping.

### The phase list

From the stdenv setup script, verified by reading it:

```text
phases="${prePhases[*]:-} unpackPhase patchPhase ${preConfigurePhases[*]:-} \
    configurePhase ${preBuildPhases[*]:-} buildPhase checkPhase \
    ${preInstallPhases[*]:-} installPhase ${preFixupPhases[*]:-} fixupPhase installCheckPhase \
    ${preDistPhases[*]:-} distPhase ${postPhases[*]:-}"
```

The ones you will touch: **unpack, patch, configure, build, check, install, fixup**. Each has a default. `unpackPhase` extracts `src` and `cd`s into it. `configurePhase` runs `./configure` if present. `buildPhase` runs `make` if a Makefile exists. `installPhase` runs `make install`. `checkPhase` is skipped unless `doCheck = true`.

Override a phase by defining the attribute as a bash string. Always keep the `runHook pre<Phase>` / `runHook post<Phase>` lines so `preInstall`/`postInstall` from users of your package still fire.

### A complete package

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "greet";
  version = "0.1.0";
  src = ./src;

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin
    install -m755 greet.sh $out/bin/greet
    runHook postInstall
  '';

  meta.description = "Prints a greeting";
}
```

- `pname` + `version` produce `name = "greet-0.1.0"`.
- `src = ./src` copies the directory into the store; a tarball or `fetchFromGitHub` result works the same way.
- `stdenvNoCC` because a shell script needs no compiler.
- `meta` is documentation: `description`, `license`, `mainProgram` (what `nix run` executes).

### `buildInputs` vs `nativeBuildInputs`

- `nativeBuildInputs` — tools that **run during the build**: `pkg-config`, `makeWrapper`, `nodejs`, `pnpm`. They go on `PATH`.
- `buildInputs` — libraries the **result links against or needs at run time**: `openssl`, `zlib`. They are added to compiler search paths, not `PATH`.

Mixing them up works by accident on your own machine and breaks under cross-compilation and `strictDeps = true`. nixpkgs reviewers reject it. Rule: if you type the command in a phase, it is native.

### Reading hello's recipe

```sh
nix derivation show nixpkgs#hello | jq '.derivations[] | .structuredAttrs | {pname, version, src, buildInputs, nativeBuildInputs, doCheck}'
```

```text
{
  "pname": "hello",
  "version": "2.12.3",
  "src": "/nix/store/wj7phsmi7ncidl8k00p489krqss7n9sd-hello-2.12.3.tar.gz",
  "buildInputs": [],
  "nativeBuildInputs": [
    "/nix/store/4zmz5rk7cgs8n7mkpmha2sjvkq4zwdv4-version-check-hook"
  ],
  "doCheck": true
}
```

`hello` uses `__structuredAttrs`, so attributes live under `structuredAttrs` in the JSON instead of `env`. Both are the same idea: attributes become build-time data.

## Try it

Create `src/greet.sh` containing `#!/bin/sh` and `echo hello from greet`, save the package as `default.nix`, then:

```sh
nix build --impure -f default.nix --no-link --print-out-paths
```

```text
/nix/store/kv7knvf42fviq3m2hn955azv097imy0s-greet-0.1.0
```

```sh
nix log -f default.nix --impure
```

```text
Running phase: unpackPhase
unpacking source archive /nix/store/dy86hwkggvbzw2y977w1k90ff9svl0a2-src
source root is src
Running phase: patchPhase
Running phase: updateAutotoolsGnuConfigScriptsPhase
Running phase: configurePhase
no configure script, doing nothing
Running phase: buildPhase
no Makefile or custom buildPhase, doing nothing
Running phase: installPhase
Running phase: fixupPhase
shrinking RPATHs of ELF executables and libraries in /nix/store/kv7knvf42fviq3m2hn955azv097imy0s-greet-0.1.0
checking for references to /build/ in /nix/store/kv7knvf42fviq3m2hn955azv097imy0s-greet-0.1.0...
patching script interpreter paths in /nix/store/kv7knvf42fviq3m2hn955azv097imy0s-greet-0.1.0
/nix/store/kv7knvf42fviq3m2hn955azv097imy0s-greet-0.1.0/bin/greet: interpreter directive changed from "#!/bin/sh" to "/nix/store/10dxp0qxqxxsyiljrh2kp0xqhz6arhcx-bash-5.3p15/bin/sh"
```

(`@nix` JSON lines removed.) Every default phase ran and said what it did. Note the last line: fixup rewrote `#!/bin/sh` to a store path, because `/bin/sh` does not exist on NixOS.

## Exercise

Add a `buildPhase` that writes `built on $(uname -m)` into a file `BUILD_INFO`, and install it to `$out/share/BUILD_INFO`. Build, then `cat` the file.

<details>
<summary>Solution</summary>

```nix
let
  pkgs = import (builtins.getFlake "nixpkgs") { };
in
pkgs.stdenvNoCC.mkDerivation {
  pname = "greet";
  version = "0.2.0";
  src = ./src;

  buildPhase = ''
    runHook preBuild
    echo "built on $(uname -m)" > BUILD_INFO
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/bin $out/share
    install -m755 greet.sh $out/bin/greet
    cp BUILD_INFO $out/share/
    runHook postInstall
  '';
}
```

```text
built on x86_64
```

`buildPhase` runs inside the unpacked source, so `BUILD_INFO` sits next to `greet.sh` when `installPhase` runs.

</details>

## Trap

Putting a tool in `buildInputs` and getting `command not found` in `buildPhase`. With `strictDeps = true`, which `buildNpmPackage` and friends enable, `buildInputs` are not added to `PATH`. Verified with `hello` as the tool:

```text
       Reason: builder failed with exit code 127.
       > /nix/store/xai718x2gpf0kf73zwhhv50likh5c18l-stdenv-linux-no-cc/setup: line 1770: hello: command not found
```

The same derivation with `nativeBuildInputs = [ pkgs.hello ]` builds. Recognise it by a tool you clearly listed being "not found". The realistic case is `nodejs` or `pnpm` in the wrong list.

## Checkpoint

```quiz
[
  {"q": "In which phase does `$out/bin` normally get created?", "options": ["buildPhase", "fixupPhase", "installPhase", "unpackPhase"], "answer": 2, "why": "installPhase copies build results into $out; earlier phases work in the source directory."},
  {"q": "Where does `pkg-config` belong?", "options": ["buildInputs", "nativeBuildInputs", "propagatedBuildInputs", "src"], "answer": 1, "why": "It is a tool executed during the build on the build machine, so it is a native input."},
  {"q": "Why keep `runHook preInstall` when overriding installPhase?", "options": ["It is required syntax", "So preInstall/postInstall hooks from overrides and dependencies still run", "It creates $out", "It speeds up the build"], "answer": 1, "why": "runHook is what makes pre/post hooks fire; dropping it silently disables them."}
]
```
