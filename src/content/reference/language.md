---
title: Language cheatsheet
order: 2
summary: Every Nix syntax form on one page, with the operator table and the builtins and lib functions used daily.
---

Every `nix` block on this page parses with `nix-instantiate --parse`. Outputs shown were produced by `nix eval --expr` on Nix 2.35.2. In fish, wrap expressions in single quotes.

## Literals

| Form | Example | Type |
|---|---|---|
| Integer | `42`, `-7` | `int` |
| Float | `3.14`, `1.0e3` | `float` |
| Boolean | `true`, `false` | `bool` |
| Null | `null` | `null` |
| String | `"hi"` | `string` |
| Indented string | `''...''` | `string` |
| Path | `./src`, `/etc/hosts` | `path` |
| List | `[ 1 "a" true ]` | `list` |
| Attrset | `{ a = 1; }` | `set` |
| Function | `x: x + 1` | `lambda` |

`builtins.typeOf` returns the type name. `7 / 2` is `3`; `7.0 / 2` is `3.5`.

## Strings

```nix
let name = "nix"; n = 3; in [
  "hi ${name}"
  "count: ${toString n}"
  "tab\tnewline\n"
  ''
    indented
      keeps relative indent
  ''
  ("a" + "b")
]
```

```text
[ "hi nix" "count: 3" "tab\tnewline\n" "indented\n  keeps relative indent\n" "ab" ]
```

Interpolation needs a string; `${3}` fails with `cannot coerce an integer to a string`. Inside `''...''`, escape `${` as `''${` and `''` as `'''`.

## Paths

```nix
[ ./foo (./foo + "bar") (builtins.typeOf ./foo) ]
```

```text
[ /tmp/foo /tmp/foobar "path" ]
```

Relative to the file, or to cwd under `--expr` (run from `/tmp` here). A path interpolated into a string is copied to the store. `./foo + ./bar` is `/tmp/foo/tmp/bar`, not a join.

## Lists

```nix
[ ([ 1 2 ] ++ [ 3 ]) (builtins.elemAt [ 10 20 ] 1) (builtins.length [ ]) (map (x: x * 2) [ 1 2 ]) ]
```

```text
[ [ 1 2 3 ] 20 0 [ 2 4 ] ]
```

Space-separated. Commas are a syntax error. Parenthesise any expression that is not a single token: `[ (f x) (1 + 2) ]`.

## Attrsets

```nix
let s = { a = 1; b.c = 2; "quoted key" = 3; ${"dyn" + "amic"} = 4; }; in
[ s.a s.b.c (s ? a) (s.z or "fallback") (builtins.attrNames s) ]
```

```text
[ 1 2 true "fallback" [ "a" "b" "dynamic" "quoted key" ] ]
```

Duplicate keys are an error. `attrNames` is sorted. `s.b.c = 2;` nests automatically.

## rec

```nix
rec { a = 1; b = a + 1; }
```

```text
{ a = 1; b = 2; }
```

Without `rec`, `b = a + 1` is `undefined variable 'a'`. A cycle is `infinite recursion encountered`.

## let

```nix
let
  a = 1;
  b = a + 1;
  inherit (builtins) toString;
in
toString (a + b)
```

```text
"3"
```

Bindings see each other regardless of order. Inner `let` shadows outer.

## with

```nix
let a = 100; s = { a = 1; b = 2; }; in with s; [ a b ]
```

```text
[ 100 2 ]
```

`with` has the lowest priority: `a` stays `100` from the `let`. Use for short package lists only.

## inherit

```nix
let x = 1; y = 2; pkgs = { nodejs = "n"; pnpm = "p"; }; in
{ inherit x y; inherit (pkgs) nodejs; }
```

```text
{ nodejs = "n"; x = 1; y = 2; }
```

`inherit x;` is `x = x;`. `inherit (s) x;` is `x = s.x;`. Works in `let` too.

## Functions

```nix
let
  inc = x: x + 1;
  add = a: b: a + b;
  f = { a, b ? 10, ... }@args: a + b + builtins.length (builtins.attrNames args);
in
[ (inc 1) (add 1 2) ((add 1) 2) (f { a = 1; }) (f { a = 1; b = 1; z = 0; }) ]
```

```text
[ 2 3 3 12 5 ]
```

| Pattern | Meaning |
|---|---|
| `x: body` | One positional argument |
| `a: b: body` | Curried; `f 1` is a partial application |
| `{ a, b }: body` | Attrset with exactly `a` and `b` |
| `{ a, b ? 1 }: body` | `b` optional with default |
| `{ a, ... }: body` | Extra keys allowed |
| `{ a, ... }@args: body` | Also bind the whole set (defaults not included in `args`) |

Application binds tightest and is left-associative: `f a b` is `(f a) b`; `toString 1 + 2` is `(toString 1) + 2`.

## if, assert

```nix
let x = 5; in [
  (if x > 3 then "big" else "small")
  (assert x == 5; "asserted")
]
```

```text
[ "big" "asserted" ]
```

`if` needs a real boolean and always has an `else`. `assert cond; body` throws if `cond` is false. `assert 1 == 2; "ok"` reports `an integer with value '1' is not equal to an integer with value '2'`.

## Operators

| Op | Meaning | Example | Result |
|---|---|---|---|
| `//` | Attrset update, shallow | `{ a = 1; b = 2; } // { b = 3; }` | `{ a = 1; b = 3; }` |
| `++` | List concat | `[ 1 ] ++ [ 2 ]` | `[ 1 2 ]` |
| `?` | Has attribute | `{ a = 1; } ? a` | `true` |
| `or` | Fallback for missing attr | `{ }.a or 0` | `0` |
| `->` | Implication | `false -> false` | `true` |
| `==` `!=` | Equality | `1 == 1.0` | `true` |
| `<` `>` `<=` `>=` | Compare | `"a" < "b"` | `true` |
| `&&` `\|\|` `!` | Boolean | `!true` | `false` |
| `+ - * /` | Arithmetic, string and path `+` | `7 / 2` | `3` |
| `-` (unary) | Negate | `7 - -2` | `9` |

```nix
[
  ({ x = { a = 1; }; } // { x = { b = 2; }; })
  ({ a = 1; } ? b)
  ({ a = 1; }.b or "none")
  (true -> false)
]
```

```text
[ { x = { b = 2; }; } false "none" false ]
```

`//` replaces nested sets wholesale. `lib.recursiveUpdate` merges deeply.

## import

```nix
{ name, greeting ? "Hello" }:
"${greeting}, ${name}!"
```

Saved as `greet.nix`. `import ./greet.nix` returns the function; `import ./greet.nix { name = "Dave"; }` returns `"Hello, Dave!"`. A file holds exactly one expression. `import` of a directory reads its `default.nix`. Under `--expr`, relative imports need `--impure`; prefer `nix eval -f greet.nix --apply 'f: f { name = "Dave"; }'`.

## Laziness

```nix
let unused = throw "never"; s = { bad = throw "boom"; ok = 1; }; in
[ s.ok (builtins.length [ (throw "x") ]) (builtins.seq s 2) ]
```

```text
[ 1 1 2 ]
```

Nothing is evaluated until forced. `builtins.seq a b` forces `a` shallowly; `builtins.deepSeq` forces recursively. `builtins.tryEval (throw "x")` is `{ success = false; value = false; }`.

## Builtins used daily

| Function | Does |
|---|---|
| `toString x` | Number, path, bool to string |
| `builtins.typeOf x` | Type name |
| `map f list`, `builtins.filter p list` | List transform, select |
| `builtins.foldl' f init list` | Strict left fold |
| `builtins.length`, `head`, `tail`, `elem`, `elemAt` | List basics |
| `builtins.genList f n` | `[ (f 0) ... (f (n-1)) ]` |
| `builtins.attrNames`, `attrValues` | Keys (sorted), values |
| `builtins.mapAttrs (n: v: ...) s` | Transform values |
| `builtins.listToAttrs [ { name; value; } ]` | Build a set |
| `builtins.hasAttr "k" s`, `getAttr`, `removeAttrs s [ "k" ]` | Set access |
| `builtins.concatStringsSep sep list` | Join |
| `builtins.replaceStrings from to s` | Substitute |
| `builtins.substring start len s`, `stringLength` | Slice, length |
| `builtins.split regex s` | Regex split with captures interleaved |
| `builtins.toJSON`, `fromJSON` | JSON both ways |
| `builtins.trace msg v` | Print to stderr, return `v` |
| `builtins.throw msg`, `abort msg` | Fail (`tryEval` catches only `throw` and `assert`) |
| `builtins.readFile p`, `pathExists`, `readDir` | Filesystem |
| `builtins.getFlake "nixpkgs"` | Load a flake (impure under `--expr`) |
| `builtins.functionArgs f` | Pattern keys with has-default flags |
| `builtins.compareVersions a b` | `-1`, `0`, `1` |
| `builtins.parseDrvName "hello-2.12.3"` | `{ name = "hello"; version = "2.12.3"; }` |

`builtins.currentSystem` is unavailable in pure mode, which is every flake.

## lib used daily

Available as `pkgs.lib` or `nixpkgs.lib`. Signatures from the lib source doc comments.

| Function | Does | Example result |
|---|---|---|
| `lib.genAttrs names f` | Set from names | `genAttrs [ "a" ] (n: 1)` is `{ a = 1; }` |
| `lib.mapAttrs' f s` | Rename and transform | returns set from `nameValuePair` results |
| `lib.mapAttrsToList f s` | Set to list | `[ "a=1" "b=2" ]` |
| `lib.filterAttrs (n: v: ...) s` | Keep matching keys | |
| `lib.recursiveUpdate a b` | Deep merge | `{ x = { a = 1; c = 3; }; }` |
| `lib.attrByPath [ "a" "b" ] def s` | Safe nested access | |
| `lib.optional cond x` | `[ x ]` or `[ ]` | |
| `lib.optionals cond list` | `list` or `[ ]` | |
| `lib.optionalString cond s` | `s` or `""` | |
| `lib.toUpper`, `toLower` | Case | `"HELLO"` |
| `lib.hasPrefix p s`, `hasSuffix`, `hasInfix` | Tests | `true` |
| `lib.removePrefix`, `removeSuffix` | Strip | `"default"` |
| `lib.splitString sep s` | Plain split | `[ "1" "2" "3" ]` |
| `lib.concatMapStringsSep sep f list` | Map then join | `"<a>, <b>"` |
| `lib.replaceStrings`, `concatStringsSep` | Same as builtins | |
| `lib.flatten`, `unique`, `last`, `range a b` | Lists | `[ 1 2 3 4 5 ]` |
| `lib.pipe x [ f g ]` | `g (f x)` | `pipe 2 [ (x: x + 1) (x: x * 10) ]` is `30` |
| `lib.fix f` | Fixpoint | `fix (self: { a = 1; b = self.a + 1; })` is `{ a = 1; b = 2; }` |
| `lib.versionAtLeast a b`, `versionOlder` | Version compare | `true` |
| `lib.getExe pkg` | Path to main binary | `"/nix/store/...-hello-2.12.3/bin/hello"` |
| `lib.isDerivation x` | Test | `true` for `pkgs.hello` |
| `lib.debug.traceVal x`, `traceValFn f x`, `traceSeq x v` | Debug prints | |
| `lib.mkIf`, `mkMerge`, `mkDefault`, `mkForce`, `mkOption`, `types.*` | Module system | see `/reference/modules` |

Find anything else at noogle.dev, or `builtins.unsafeGetAttrPos "name" lib.attrsets` to jump to the source line.

## Comments

```nix
# line comment
1 /* block
comment */ + 1
```

```text
2
```
