---
title: Functions
stage: 2
order: 9
slug: functions
summary: Write and call Nix functions with positional and attrset arguments, and read any package.nix as a function.
minutes: 18
---

## Why this matters

Every `flake.nix` output is a function. Every file in `pkgs/by-name/` is a function. `callPackage`, overlays, modules: functions. Nix functions take exactly one argument, and the attrset-pattern form is what makes `{ lib, stdenv, ... }:` at the top of a package file readable instead of magic.

## Concept

### One argument, always

`x: body`. The colon separates parameter from body. Call by juxtaposition, no parentheses:

```nix
let f = x: x + 1; in f 1
```

```text
2
```

A function printed on its own is opaque: `x: x + 1` evaluates to `«lambda @ «string»:1:1»`.

### Currying

"Two arguments" is a function returning a function:

```nix
let add = a: b: a + b; inc = add 1; in inc 41
```

```text
42
```

`add 1` is a partial application. `builtins.typeOf (add 1)` is `"lambda"`. This is why `map (x: x * 2) [ 1 2 3 ]` reads as `map` applied to a function, then to a list.

### Attrset patterns

The form you will read most. The argument must be an attrset with exactly these keys:

```nix
let f = { a, b }: a + b; in f { a = 1; b = 2; }
```

```text
3
```

Extra keys are an error, and the message names the function and the key:

```text
error: function 'f' called with unexpected argument 'c'
```

Missing keys too:

```text
error: function 'f' called without required argument 'a'
```

### Defaults with `?`

```nix
let f = { a, b ? 10 }: a + b; in f { a = 1; }
```

```text
11
```

Defaults can reference other arguments: `{ a, b ? a * 2 }: b` called with `{ a = 5; }` gives `10`.

### Allow extras with `...`

```nix
let f = { a, b, ... }: a + b; in f { a = 1; b = 2; c = 3; }
```

```text
3
```

Without `...` this is the "unexpected argument" error. Package files use `...` rarely; module functions use it always, because the module system passes many arguments you do not name.

### Capture the whole set with `@`

```nix
let f = { a, ... }@args: builtins.attrNames args; in f { a = 1; z = 26; }
```

```text
[ "a" "z" ]
```

`args@{ ... }` is the same thing with the name first. One subtlety: `args` is the set **as passed**, defaults are not included:

```nix
let f = { a, b ? 10, ... }@args: args; in f { a = 1; }
```

```text
{ a = 1; }
```

`args.b` would be `attribute 'b' missing`. Use the bare `b` to get the default.

### A file can be a function

A `.nix` file holds one expression. If that expression is a function, `import` returns the function and you call it:

```nix
{ name, greeting ? "Hello" }:
"${greeting}, ${name}!"
```

Save as `greet.nix`, then:

```sh
nix eval --impure --expr 'import ./greet.nix { name = "Dave"; }'
```

```text
"Hello, Dave!"
```

`--impure` because `--expr` runs in pure mode and may not read arbitrary paths. Cleaner: `nix eval -f greet.nix --apply 'f: f { name = "Dave"; }'`, same output.

Nix can tell you a function's declared parameters:

```sh
nix eval -f greet.nix --apply 'f: builtins.functionArgs f'
```

```text
{ greeting = true; name = false; }
```

`true` means "has a default". Tooling uses this.

### `callPackage`: automatic argument filling

A package file in nixpkgs looks like this:

```nix
{ lib, nodejs, pnpm }:
{
  node = nodejs.version;
  pnpm = pnpm.version;
  label = lib.toUpper "sveltekit";
}
```

Nobody passes `lib`, `nodejs` and `pnpm` by hand. `pkgs.callPackage ./mypkg.nix { }` reads the pattern with `functionArgs`, looks each name up in `pkgs`, and calls the function. The second argument overrides:

```sh
nix eval --impure --expr 'let pkgs = import (builtins.getFlake "nixpkgs") {}; in (pkgs.callPackage ./mypkg.nix { nodejs = pkgs.nodejs_22; }).node'
```

```text
"22.23.3"
```

Without the override `.node` is `"24.21.0"`. This is the entire mechanism behind `pkgs/by-name`: the function declares what it needs, `callPackage` supplies it. See [Builtins and lib](/learn/builtins-and-lib) for `functionArgs` and friends.

## Try it

```sh
nix eval --expr 'let f = { a, b ? 10, ... }@args: { sum = a + b; passed = builtins.attrNames args; }; in f { a = 1; z = 0; }'
```

```text
{ passed = [ "a" "z" ]; sum = 11; }
```

```sh
nix eval --expr 'let f = { a }: a; in f { a = 1; b = 2; }'
```

```text
error: function 'f' called with unexpected argument 'b'
```

## Exercise

Write a function `mkShellPkgs` that takes `{ node ? "nodejs_24", extra ? [ ] }` and returns the list `[ node "pnpm" "biome" ] ++ extra`. Call it twice: once with no arguments, once with `node = "nodejs_22"` and `extra = [ "turso-cli" ]`.

<details>
<summary>Solution</summary>

```nix
let
  mkShellPkgs = { node ? "nodejs_24", extra ? [ ] }: [ node "pnpm" "biome" ] ++ extra;
in
[
  (mkShellPkgs { })
  (mkShellPkgs { node = "nodejs_22"; extra = [ "turso-cli" ]; })
]
```

```text
[ [ "nodejs_24" "pnpm" "biome" ] [ "nodejs_22" "pnpm" "biome" "turso-cli" ] ]
```

`mkShellPkgs { }` still needs the empty set: a pattern function requires an attrset argument, even if every key has a default.

</details>

## Trap

`f a b` where you meant `f (a b)`. Function application is left-associative and binds tighter than everything, so `toString 1 + 2` parses as `(toString 1) + 2` and fails with "cannot coerce". Any argument that is itself an expression needs parentheses: `toString (1 + 2)`, `map (x: x + 1) list`, `import ./f.nix { }`.

## Checkpoint

```quiz
[
  {"q": "How many arguments does a Nix function take?", "options": ["Any number", "Exactly one", "Zero or one", "At most two"], "answer": 1, "why": "Every function takes one argument; multi-argument functions are curried or take an attrset."},
  {"q": "What does ... in { a, ... }: do?", "options": ["Makes a optional", "Allows the caller to pass extra attributes", "Captures the whole set", "Spreads a into scope"], "answer": 1, "why": "Without the ellipsis, any attribute not named in the pattern is a 'called with unexpected argument' error."},
  {"q": "In { a, b ? 1, ... }@args, when called with { a = 0; }, what is args ? b?", "options": ["true", "false", "an error", "1"], "answer": 1, "why": "The @ name binds the set exactly as passed; defaults are visible only through the bare parameter name."}
]
```
