---
title: Attrsets, let, with, inherit
stage: 2
order: 8
slug: attrsets-let-with-inherit
summary: Build and merge attribute sets, bind names with let and inherit, and predict exactly what with brings into scope.
minutes: 18
---

## Why this matters

Every flake, every package, every home-manager config is an attribute set. `//`, `rec`, `with` and `inherit` appear in all of them. Two of these have behaviour that looks like a bug the first time you meet it: `//` does not merge nested sets, and `with` loses to any name already in scope.

## Concept

### Attribute sets

Curly braces, `name = value;` pairs, semicolons mandatory, order irrelevant. Nested access with dots. `a.b.c = 1;` is shorthand for nesting:

```nix
{ a.b.c = 1; }
```

```text
{ a = { b = { c = 1; }; }; }
```

Keys can be any string, quoted when not an identifier, or computed with `${}`:

```nix
let k = "dyn"; in { ${k} = 1; "with space" = 2; }
```

```text
{ dyn = 1; "with space" = 2; }
```

Defining a key twice is an error, not a last-wins override. Accessing a missing key is an error. Test first with `?`, or fall back with `or`:

```nix
[ ({ a = 1; } ? b) ({ a = 1; }.b or "default") ]
```

```text
[ false "default" ]
```

### `//` merges one level only

The update operator takes keys from the right side, overriding the left:

```nix
{ a = 1; b = 2; } // { b = 3; }
```

```text
{ a = 1; b = 3; }
```

It is **shallow**. A nested set on the right replaces the whole nested set on the left:

```nix
{ x = { a = 1; b = 2; }; } // { x = { c = 3; }; }
```

```text
{ x = { c = 3; }; }
```

`a` and `b` are gone. For deep merge use `lib.recursiveUpdate` (see [Builtins and lib](/learn/builtins-and-lib)), which gives `{ x = { a = 1; b = 2; c = 3; }; }`. The module system has its own merge rules; neither is `//`.

### `rec`: self-reference

Plain attrsets cannot see their own keys. `{ a = 1; b = a + 1; }` fails:

```text
error: undefined variable 'a'
       at «string»:1:14:
            1| { a = 1; b = a + 1; }
             |              ^
```

`rec` allows it:

```nix
rec { a = 1; b = a + 1; }
```

```text
{ a = 1; b = 2; }
```

`rec` plus a cycle is `infinite recursion encountered`. Prefer `let` for intermediate values; `rec` is mostly seen in older package definitions.

### `let ... in`

Local bindings, visible in the body and in each other (order-free, recursive by default):

```nix
let a = 1; b = a + 1; in b * 10
```

```text
20
```

Inner `let` shadows outer. `let x = 1; in let x = 2; in x` is `2`.

### `inherit`: copy a binding into a set

`inherit a b;` means `a = a; b = b;`. `inherit (set) a b;` means `a = set.a; b = set.b;`:

```nix
let
  pkgs = { nodejs = "node"; pnpm = "pnpm"; biome = "biome"; };
in
{ inherit (pkgs) nodejs pnpm; }
```

```text
{ nodejs = "node"; pnpm = "pnpm"; }
```

This is the idiom you will see at the top of every flake output: `inherit (pkgs) lib;`. Also works inside `let`: `let inherit (pkgs) lib; in ...`.

### `with`: bring all keys into scope

`with s; body` makes every key of `s` a variable in `body`:

```nix
let s = { a = 1; b = 2; }; in with s; a + b
```

```text
3
```

The scoping rule: **names from `with` have the lowest priority**. Any `let`, function argument, or outer binding wins:

```nix
let a = 100; s = { a = 1; }; in with s; a
```

```text
100
```

Not `1`. The `with` did not shadow `a`; it was shadowed by it. Reversed nesting gives the same answer: `with { a = 1; }; let a = 100; in a` is `100`. Nix never lets `with` override an explicit binding.

Why this exists: `with` is dynamic. The evaluator cannot know at parse time which names `s` contains, so a static binding must win or every `with` would be a scope-corruption risk.

Practical rule: `with pkgs; [ nodejs pnpm biome ]` for a short package list is fine. `with pkgs;` around a large block is a trap: you add `let lib = ...` later, or a function argument named `system`, and a reference silently points at the wrong thing with no error.

## Try it

```sh
nix eval --expr 'let a = 100; s = { a = 1; }; in with s; a'
```

```text
100
```

```sh
nix eval --expr '{ x = { a = 1; }; } // { x = { b = 2; }; }'
```

```text
{ x = { b = 2; }; }
```

## Exercise

Given `base = { server = { port = 3000; host = "localhost"; }; debug = false; }`, produce a `prod` set where `host` is `"example.com"`, `port` stays `3000` and `debug` stays `false`. Do it with `//` only, no `lib`. Then explain why the obvious one-liner is wrong.

<details>
<summary>Solution</summary>

```nix
let
  base = { server = { port = 3000; host = "localhost"; }; debug = false; };
in
base // { server = base.server // { host = "example.com"; }; }
```

```text
{ debug = false; server = { host = "example.com"; port = 3000; }; }
```

The obvious `base // { server.host = "example.com"; }` evaluates to `{ debug = false; server = { host = "example.com"; }; }`: `port` is lost, because `server.host = ...` builds a fresh `server` set and `//` replaces the old one wholesale.

</details>

## Trap

`with pkgs; [ nodejs pnpm ]` inside a function whose argument pattern already includes `{ pkgs, nodejs, ... }`. The list silently uses the argument `nodejs`, not `pkgs.nodejs`. No error, wrong version in the shell. Use `inherit (pkgs)` or `pkgs.nodejs` explicitly when the surrounding scope is not trivially small.

## Checkpoint

```quiz
[
  {"q": "What is { x = { a = 1; }; } // { x = { b = 2; }; }?", "options": ["{ x = { a = 1; b = 2; }; }", "{ x = { b = 2; }; }", "{ x = { a = 1; }; }", "an error"], "answer": 1, "why": "// is shallow: the right-hand x replaces the whole left-hand x."},
  {"q": "In let a = 100; s = { a = 1; }; in with s; a, what is the result?", "options": ["1", "100", "an error", "null"], "answer": 1, "why": "Names introduced by with have the lowest priority; the let binding wins."},
  {"q": "What does inherit (pkgs) nodejs; expand to?", "options": ["nodejs = pkgs;", "pkgs = nodejs;", "nodejs = pkgs.nodejs;", "with pkgs; nodejs"], "answer": 2, "why": "inherit (set) name copies set.name into the current attrset or let under the same name."}
]
```
