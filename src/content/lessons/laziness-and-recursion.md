---
title: Laziness and recursion
stage: 2
order: 10
slug: laziness-and-recursion
summary: Predict what Nix evaluates and what it skips, force evaluation on purpose, and read a fixpoint.
minutes: 18
---

## Why this matters

nixpkgs is an attrset with 28000+ entries, and `nix eval nixpkgs#hello.version` returns in a second. That is only possible because Nix is lazy: nothing is computed until something looks at it. Laziness is also why overlays work, why `infinite recursion` errors appear where you did not expect them, and why an `assert` deep in a package never fires until you build it.

## Concept

### Values are computed on demand

A binding that is never used is never evaluated, even if it would crash:

```nix
let x = throw "never evaluated"; in 42
```

```text
42
```

Same inside an attrset or a list. Only the parts you touch are computed:

```nix
let s = { a = throw "boom"; b = 2; }; in s.b
```

```text
2
```

```nix
builtins.length [ (throw "boom") 2 ]
```

```text
2
```

The length of a list does not need the elements. A function that ignores its argument never evaluates it: `(x: 1) (throw "boom")` is `1`. `if true then 1 else throw "boom"` is `1`; the dead branch is never looked at.

The underlying concept: every unevaluated expression is a **thunk**, a suspended computation. Accessing it forces it once; the result is cached.

### Forcing on purpose: `seq` and `deepSeq`

`builtins.seq a b` forces `a` to weak head normal form, then returns `b`. Weak head means "the outer constructor only": for an attrset, that it is an attrset, not what is inside.

```nix
let s = { a = throw "boom"; }; in builtins.seq s 42
```

```text
42
```

`s` is an attrset; that is all `seq` checked. `deepSeq` recurses into everything:

```nix
let s = { a = throw "boom"; }; in builtins.deepSeq s 42
```

```text
error: boom
```

Use `deepSeq` when you want to validate a whole config now rather than discover a typo at build time. `nix eval` on an attrset prints it recursively, so it forces every leaf (and prints `«error: ...»` inline for the broken ones); `nix flake check` does not force everything, which is why a broken attribute can hide.

### Infinite recursion

A value defined in terms of itself with no base case:

```nix
let x = x + 1; in x
```

```text
error: infinite recursion encountered
```

Nix detects that forcing the thunk for `x` requires forcing `x` itself. The classic real-world cause is a `rec` set or an overlay where you wrote `self` when you meant `super`. Mutual recursion in a `rec` set shows up the same way: `rec { a = b; b = a; }`.

A function that calls itself forever is a different error, `stack overflow; max-call-depth exceeded`, because each call is a new frame rather than the same thunk.

### Fixpoints

A fixpoint of `f` is a value `x` such that `f x == x`. With laziness you can write a function that builds it:

```nix
let
  fix = f: let x = f x; in x;
in
fix (self: { a = 1; b = self.a + 1; })
```

```text
{ a = 1; b = 2; }
```

Read it slowly. `x = f x` is not infinite recursion because `f` returns an attrset without looking inside `self`. Only when you access `b` does `self.a` get forced, and `self` is `x`, which is already the result set. `lib.fix` in nixpkgs is exactly this function.

The point of a fixpoint: a set can refer to its own final form, after every modification. That is what overlays need.

### Why overlays rely on laziness

An overlay is `self: super: { ... }`. `super` is the set before this overlay; `self` is the final set after all overlays. Apply one:

```nix
let
  fix = f: let x = f x; in x;
  base = self: { a = 1; b = self.a + 1; };
  overlay = self: super: super // { a = 10; };
in
fix (self: let s = base self; in s // overlay self s)
```

```text
{ a = 10; b = 11; }
```

`b` was defined as `self.a + 1` in `base`, but it sees `10`, the overlay's value, because `self` is the fixpoint. This is how overriding `nodejs` in an overlay changes every package that depends on `nodejs`, without editing them. If `b` had been eagerly computed when `base` ran, it would be `2`.

### Safe failure: `tryEval`

```nix
builtins.tryEval (throw "boom")
```

```text
{ success = false; value = false; }
```

Catches `throw` and `assert` only. Does not catch `abort`, missing attributes, or type errors. Used by `nix search` to skip broken packages.

## Try it

```sh
nix eval --expr 'let s = { ok = 1; bad = throw "boom"; }; in s.ok'
```

```text
1
```

```sh
nix eval --expr 'let s = { ok = 1; bad = throw "boom"; }; in s'
```

```text
{ bad = «error: boom»; ok = 1; }
```

Printing the whole set forces `bad`, and `nix eval` shows the failure inline. Same set, different observer, different result. That is laziness.

## Exercise

Without running it, predict the output of each, then verify:

1. `builtins.seq (throw "a") 1`
2. `builtins.seq [ (throw "a") ] 1`
3. `let f = n: if n == 0 then "done" else f (n - 1); in f 3`

<details>
<summary>Solution</summary>

1. `error: a`. `seq` forces its first argument, which is the throw itself.
2. `1`. The first argument is a list; `seq` only checks that it is a list, not its elements.
3. `"done"`. Recursion with a base case is fine; `n == 0` becomes true after three calls.

```sh
nix eval --expr 'builtins.seq [ (throw "a") ] 1'
nix eval --expr 'let f = n: if n == 0 then "done" else f (n - 1); in f 3'
```

```text
1
"done"
```

</details>

## Trap

A typo in a flake output that `nix flake show` and `nix develop` both accept, then explodes a week later when CI evaluates the one attribute that touches it. Laziness hides errors in paths nobody has forced. When you change shared config, force it: `nix eval .#devShells.x86_64-linux.default.name` or `nix flake check`, and `builtins.deepSeq` on config sets you hand-roll.

## Checkpoint

```quiz
[
  {"q": "What does let x = throw \"boom\"; in 42 evaluate to?", "options": ["error: boom", "42", "null", "a lambda"], "answer": 1, "why": "x is never used, so its thunk is never forced and the throw never runs."},
  {"q": "What is the difference between builtins.seq and builtins.deepSeq?", "options": ["None", "seq forces only the outer value; deepSeq forces everything inside", "deepSeq is faster", "seq works on lists, deepSeq on attrsets"], "answer": 1, "why": "seq stops at weak head normal form; deepSeq recurses into nested attrsets and lists."},
  {"q": "Why does fix (self: { a = 1; b = self.a + 1; }) not loop forever?", "options": ["Nix caps recursion at 10 levels", "The function returns an attrset without forcing self, so self.a is only read later from the finished set", "fix is a builtin with special treatment", "b is evaluated before a"], "answer": 1, "why": "Laziness lets the set exist before its fields are computed; self.a is forced only when b is accessed."}
]
```
