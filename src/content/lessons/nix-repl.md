---
title: The Nix REPL
stage: 2
order: 12
slug: nix-repl
summary: Use nix repl to load files and flakes, inspect nixpkgs interactively, and read docs without leaving the terminal.
minutes: 15
---

## Why this matters

`nix eval --expr` with fish quoting is fine for one-liners. For anything longer, you want a prompt that keeps state. `nix repl` is that prompt, and it is the fastest way to answer "what is in `pkgs.hello.meta`" or "what does this flake export" without writing a file.

## Concept

### Start it

```sh
nix repl
```

```text
Nix 2.35.2
Type :? for help.
nix-repl>
```

Type an expression, get its value. Assign with `name = expr` (no `let`, no semicolon). Tab completes variable names and attribute paths: type `builtins.att` and press Tab.

### The commands

Everything starting with `:` is a REPL command, not Nix. The ones that matter:

| Command | Does |
|---|---|
| `:l <path>` | Load a `.nix` file; if it is an attrset, its keys become variables |
| `:lf <flakeref>` | Load a flake; its outputs become variables |
| `:p <expr>` | Print recursively (normal printing stops at one level) |
| `:t <expr>` | Describe the type |
| `:doc <expr>` | Show documentation for a builtin |
| `:b <expr>` | Build a derivation, print its output path |
| `:e <expr>` | Open the package or function in `$EDITOR` |
| `:r` | Reload all loaded files after you edit them |
| `:q` | Quit |

Verify: `:?` prints the full list.

### `:p` versus plain printing

The REPL prints lazily, one level deep:

```text
nix-repl> x = { a = { b = { c = 1; }; }; }

nix-repl> x
{
  a = { ... };
}

nix-repl> :p x
{
  a = {
    b = { c = 1; };
  };
}
```

Plain printing on nixpkgs would try to evaluate 28000 packages. The `...` is Nix protecting you. Use `:p` when you want to see inside a small set.

### Loading a file

Given `config.nix` returning `{ dev = ...; prod = ...; url = ...; }`:

```text
nix-repl> :l /tmp/config.nix
Added 3 variables.
dev, prod, url

nix-repl> dev
{
  host = "localhost";
  port = 3000;
}
```

Edit the file in another window, then `:r` to reload. `dev` now reflects the change.

### Loading nixpkgs

`:lf nixpkgs` loads the nixpkgs flake. The variables are the flake's outputs, so packages live under `legacyPackages.<system>`, not `pkgs`:

```text
nix-repl> :lf nixpkgs
Added 17 variables.
_type, checks, devShells, formatter, htmlDocs, inputs, lastModified, lastModifiedDate, legacyPackages, lib, narHash, nixosModules, outPath, outputs, rev, shortRev, sourceInfo

nix-repl> pkgs = legacyPackages.x86_64-linux

nix-repl> pkgs.hello.meta.description
"Program that produces a familiar, friendly greeting"

nix-repl> :t pkgs.hello
a set
```

A derivation is "a set" to the REPL. `lib` is there directly. `builtins.currentSystem` works in the REPL (it is impure by default), so `legacyPackages.${builtins.currentSystem}` is portable.

Shortcut: `nix repl nixpkgs` loads the same flake at startup (`Added 7 variables`). To get the package set itself as the scope, `nix repl --expr 'import (builtins.getFlake "nixpkgs") {}'` adds all 28300 attributes, so `hello.version` works bare. Slower to start; fine once cached.

### Exploring a package

```text
nix-repl> :p pkgs.hello.meta.license
{
  deprecated = false;
  free = true;
  fullName = "GNU General Public License v3.0 or later";
  licenseType = "simple";
  redistributable = true;
  shortName = "gpl3Plus";
  spdxId = "GPL-3.0-or-later";
  url = "https://spdx.org/licenses/GPL-3.0-or-later.html";
}
```

`builtins.attrNames pkgs.hello.meta` lists the keys. `pkgs.hello.meta.position` tells you where in nixpkgs the package is defined; `:e pkgs.hello` opens that file in Neovim. `:b pkgs.hello` builds it and prints the store path.

### Docs inline

```text
nix-repl> :doc builtins.map
Synopsis: builtins.map f list
Apply the function f to each element in the list list. For
example,
  │ map (x: "foo" + x) [ "bar" "bla" "abc" ]
evaluates to [ "foobar" "foobla" "fooabc" ].
```

Works for builtins. For `lib` functions, read the source via `:e lib.genAttrs` or noogle.dev, as in [Builtins and lib](/learn/builtins-and-lib).

### Your own flake

Inside a project directory, `:lf .` loads the local flake. `devShells.x86_64-linux.default.name` gives `"nix-shell"`. `:lf .` is the fastest way to check an output exists before running `nix develop`.

## Try it

Run this and compare the two prints:

```sh
printf 'x = { a = { b = 1; }; }\nx\n:p x\n:q\n' | nix repl
```

```text
Nix 2.35.2
Type :? for help.

{
  a = { ... };
}

{
  a = { b = 1; };
}
```

Then an interactive session: `nix repl nixpkgs`, type `legacyPackages.x86_64-linux.hello.version`, expect `"2.12.3"`, then `:q`.

## Exercise

In a REPL with nixpkgs loaded, find the version of Biome and the file in nixpkgs that defines it, without using `nix search` or `nix eval`.

<details>
<summary>Solution</summary>

```text
nix-repl> :lf nixpkgs
nix-repl> pkgs = legacyPackages.x86_64-linux
nix-repl> pkgs.biome.version
"2.5.14"
nix-repl> pkgs.biome.meta.position
```

The position is a string ending in `package.nix:<line>` under the nixpkgs store path. `:e pkgs.biome` opens the same file. Tab completion after `pkgs.bio` would also have found the attribute.

</details>

## Trap

Typing `pkgs.hello` and pressing Enter without `:p` or an attribute. The REPL prints `«derivation /nix/store/...-hello-2.12.3.drv»` and nothing else, which looks like an error but is the one-line summary of a derivation. Add `.meta`, `.version`, `.outPath`, or `:p`, depending on what you want.

## Checkpoint

```quiz
[
  {"q": "After :lf nixpkgs, where are the packages?", "options": ["pkgs", "legacyPackages.<system>", "packages.<system>", "outputs.pkgs"], "answer": 1, "why": "Loading a flake exposes its outputs; nixpkgs exports packages under legacyPackages per system."},
  {"q": "What does :p do that plain printing does not?", "options": ["Pretty-prints JSON", "Evaluates and prints nested attrsets recursively", "Prints the type", "Prints the derivation path"], "answer": 1, "why": "Plain printing stops one level deep and shows { ... }; :p forces and prints everything."},
  {"q": "Which command reloads files after you edit them?", "options": [":l", ":r", ":lf", ":e"], "answer": 1, "why": ":r reloads every file previously loaded with :l or :lf so the REPL reflects your changes."}
]
```
