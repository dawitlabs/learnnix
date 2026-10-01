---
title: Values and literals
stage: 2
order: 7
slug: language-values
summary: Write every primitive Nix value correctly, including the two that bite TypeScript people: lists and paths.
minutes: 15
---

## Why this matters

Nix expressions look like JSON with semicolons. They are not. Lists have no commas, paths are a distinct type from strings, and integer division truncates. Every one of these is a silent bug or a cryptic error in a flake. Ten minutes here saves an hour of `--show-trace` later.

## Concept

All examples run with `nix eval --expr '...'`. In fish, wrap the expression in single quotes; fish does not expand `${}` inside them. Double quotes break: fish tries to expand `${name}` itself and errors with `Variables cannot be bracketed`.

### Strings

Double-quoted, with `\n` escapes and `${}` interpolation:

```nix
let name = "dave"; in "hi ${name}"
```

```text
"hi dave"
```

Interpolation only accepts strings (and paths, and attrsets with an `outPath`). Numbers must be converted:

```nix
"port: ${toString 80}"
```

```text
"port: 80"
```

Without `toString`:

```text
error: cannot coerce an integer to a string: 80
```

The `+` operator concatenates strings and has the same rule: `"port: " + toString 80` works, `"1" + 1` does not.

### Indented strings

Two single quotes. The common leading whitespace is stripped. Interpolation still works. This is how shell hooks and config files are written:

```nix
let port = 80; in ''
  listen ${toString port};
''
```

```text
"listen 80;\n"
```

Note the trailing `\n`: the closing `''` on its own line keeps the final newline. To write a literal `${` inside an indented string, escape as `''${`.

### Numbers

Integers and floats are separate types. Division between integers truncates:

```nix
[ (7 / 2) (7.0 / 2) (builtins.typeOf 1) (builtins.typeOf 1.5) ]
```

```text
[ 3 3.5 "int" "float" ]
```

`1 == 1.0` is `true`; comparison converts. Division does not.

### Booleans and null

`true`, `false`, `null`. Operators: `&&`, `||`, `!`, and `->` (implication, rare). `if` requires a real boolean. `if 1 then ...` errors with `expected a Boolean but found an integer`. There is no truthiness.

### Lists

Space-separated, square brackets, any mix of types:

```nix
[ "a" 1 true null ]
```

```text
[ "a" 1 true null ]
```

Commas are a syntax error:

```text
error: syntax error, unexpected ','
```

The trap for TypeScript people: function application also uses spaces. `[ 1 2 3 + 4 ]` is a syntax error, and `[ f x ]` is a two-element list, not a call. Parenthesise expressions inside lists:

```nix
[ 1 2 (3 + 4) ]
```

```text
[ 1 2 7 ]
```

Concatenate with `++`. Index with `builtins.elemAt list 1` (zero-based). No `list[1]` syntax.

### Paths versus strings

A bare token containing a `/` and not in quotes is a **path**, a separate type:

```nix
[ (builtins.typeOf ./foo) (builtins.typeOf "./foo") ]
```

```text
[ "path" "string" ]
```

Paths are resolved at parse time relative to the file (or the cwd for `--expr`). Run from `/tmp`:

```nix
./foo
```

```text
/tmp/foo
```

Appending a string to a path gives a path. Appending two paths joins them literally, which is almost never what you want:

```nix
[ (./foo + "bar") (./foo + ./bar) ]
```

```text
[ /tmp/foobar /tmp/foo/tmp/bar ]
```

Why the type matters: when a path is interpolated into a string, Nix copies the file into the store and substitutes the store path. A string with the same characters is just text.

```sh
echo hi > /tmp/pathdemo.txt
nix eval --impure --expr '"${/tmp/pathdemo.txt}"'
```

```text
"/nix/store/b288mh5w3pr7gzbm38gp62hxk5fa0fj2-pathdemo.txt"
```

`--impure` is needed because `--expr` runs in pure mode, which forbids reading arbitrary absolute paths. Inside a flake, `src = ./.;` copies your project into the store; `src = "./.";` is a string the builder cannot use.

Paths must contain a slash: `./foo`, `/etc/hosts`. `foo` alone is a variable. Angle brackets `<nixpkgs>` are a third form, looked up in `NIX_PATH`; avoid in flakes.

### Comments

```nix
# line comment
1 /* block comment */ + 1
```

```text
2
```

## Try it

Run from `/tmp` so paths match the output shown.

```sh
cd /tmp
nix eval --expr '[ (./foo + "bar") (builtins.typeOf ./foo) ]'
```

```text
[ /tmp/foobar "path" ]
```

Now trigger the coercion error on purpose and read it:

```sh
nix eval --expr '"port: ${3000}"'
```

```text
error: cannot coerce an integer to a string: 3000
```

## Exercise

Write one expression that evaluates to the string `"node 22 pnpm 12"` using a `let` with `node = 22;` and `pnpm = 12;` as integers, and an indented string. The result must have no trailing newline.

<details>
<summary>Solution</summary>

```nix
let
  node = 22;
  pnpm = 12;
in
''node ${toString node} pnpm ${toString pnpm}''
```

```text
"node 22 pnpm 12"
```

Keeping the closing `''` on the same line avoids the trailing newline. Both numbers need `toString`.

</details>

## Trap

Writing `[ "nodejs" "pnpm", "biome" ]` after a day of TypeScript. The error points at the comma. Worse is `[ pkgs.nodejs pkgs.pnpm pkgs.biome ]` written as `[ pkgs.nodejs, pkgs.pnpm ]` inside a 200-line flake: the error position is correct, but you will read past it twice before you see the comma.

## Checkpoint

```quiz
[
  {"q": "What does 7 / 2 evaluate to?", "options": ["3.5", "3", "4", "an error"], "answer": 1, "why": "Both operands are integers, so Nix performs integer division and truncates."},
  {"q": "Which expression is a valid two-element list?", "options": ["[ 1, 2 ]", "[ 1 2 ]", "[1; 2]", "(1 2)"], "answer": 1, "why": "Nix lists are space-separated inside square brackets; commas are a syntax error."},
  {"q": "What is the type of ./src?", "options": ["string", "path", "attrset", "derivation"], "answer": 1, "why": "An unquoted token containing a slash is a path literal, a distinct type that is copied to the store when used as a string."}
]
```
