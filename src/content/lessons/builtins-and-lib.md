---
title: Builtins and lib
stage: 2
order: 11
slug: builtins-and-lib
summary: Tell builtins from lib, use the ten functions that cover most real code, and find the rest fast.
minutes: 18
---

## Why this matters

Nix has no standard library in the language itself. There are 116 `builtins` baked into the evaluator, and a much larger `lib` that ships inside nixpkgs. Half of reading a flake is recognising `lib.genAttrs`, `lib.optional`, `mapAttrs` and knowing which one needs `pkgs` in scope.

## Concept

### Two sources of functions

`builtins` is a global attrset. Always available, even with no nixpkgs:

```nix
builtins.length (builtins.attrNames builtins)
```

```text
116
```

A few are also exposed as bare globals: `map`, `toString`, `throw`, `import`, `derivation`, `baseNameOf`, `dirOf`, `removeAttrs`, `abort`. Everything else is `builtins.x`.

`lib` is Nix code, in `nixpkgs/lib/`. You get it from `pkgs.lib` or `nixpkgs.lib` in a flake. It wraps builtins with nicer names and adds hundreds more. Check the version to see it is just data from nixpkgs:

```sh
nix eval nixpkgs#lib.version
```

```text
"26.11.20260929.b6c8664"
```

Rule: if you are in a plain `nix eval --expr` with no nixpkgs, you have builtins only. Inside a flake output, use `lib`; it reads better and has the functions people expect.

### Lists: map, filter, fold

```nix
[
  (builtins.map (x: x + 1) [ 1 2 3 ])
  (builtins.filter (x: x > 1) [ 1 2 3 ])
  (builtins.foldl' (acc: x: acc + x) 0 [ 1 2 3 4 ])
]
```

```text
[ [ 2 3 4 ] [ 2 3 ] 10 ]
```

`foldl'` is strict in the accumulator; the apostrophe is part of the name. Also: `builtins.elem`, `builtins.head`, `builtins.tail`, `builtins.concatLists`, `builtins.genList`, `builtins.sort`. `lib` adds `lib.flatten`, `lib.unique`, `lib.last`, `lib.range`.

### Attrsets: mapAttrs, genAttrs, filterAttrs

`mapAttrs` transforms values, keeping keys. It is a builtin:

```nix
builtins.mapAttrs (name: value: value * 2) { a = 1; b = 2; }
```

```text
{ a = 2; b = 4; }
```

`genAttrs` builds a set from a list of names. This one is `lib` only:

```sh
nix eval --expr 'let lib = (builtins.getFlake "nixpkgs").lib; in lib.genAttrs [ "nodejs" "pnpm" ] (name: "pkg:${name}")' --impure
```

```text
{ nodejs = "pkg:nodejs"; pnpm = "pkg:pnpm"; }
```

This is how `forAllSystems` works in flakes: `lib.genAttrs [ "x86_64-linux" "aarch64-darwin" ] (system: ...)`.

Also from `lib.attrsets`: `filterAttrs (n: v: v > 1)`, `mapAttrsToList (n: v: "${n}=${toString v}")` giving `[ "a=1" "b=2" ]`, `recursiveUpdate` for the deep merge that `//` is not, `attrByPath [ "a" "b" ] fallback set`. Builtins: `attrNames`, `attrValues`, `hasAttr`, `getAttr`, `removeAttrs`, `intersectAttrs`, `listToAttrs`.

### Strings

```nix
[
  (builtins.concatStringsSep ", " [ "a" "b" "c" ])
  (builtins.replaceStrings [ "a" ] [ "o" ] "banana")
  (builtins.substring 0 3 "hello")
  (builtins.stringLength "hello")
]
```

```text
[ "a, b, c" "bonono" "hel" 5 ]
```

`lib.strings` adds the ones you reach for daily: `toUpper`, `hasPrefix`, `splitString "." "1.2.3"` giving `[ "1" "2" "3" ]`, `removeSuffix`, `concatMapStringsSep`, `optionalString cond "text"`. Note `builtins.split` is a regex splitter that returns captures interleaved: `builtins.split "," "a,b,c"` is `[ "a" [ ] "b" [ ] "c" ]`. Use `lib.splitString` for the obvious behaviour.

### Conditionals as data: `optional`, `optionals`

The most common `lib` idiom in package lists:

```sh
nix eval nixpkgs#lib.optional --apply 'f: [ (f true "yes") (f false "yes") ]'
```

```text
[ [ "yes" ] [ ] ]
```

`packages = [ pkgs.nodejs ] ++ lib.optional withTurso pkgs.turso-cli;` adds the item only when the flag is true. `lib.optionals` takes a list instead of one item.

### JSON

`builtins.toJSON` and `builtins.fromJSON` convert both ways:

```nix
builtins.fromJSON (builtins.toJSON { a = 1; b = [ true null ]; })
```

```text
{ a = 1; b = [ true null ]; }
```

`nix eval --json` uses the same conversion. Handy for feeding Nix data to Node.

### Finding functions

Three routes, in order:

1. **noogle.dev**. Search by name or by type signature. Type `genAttrs`, read the signature and example. Covers builtins and lib.
2. **`:doc` in the repl** for builtins: `:doc builtins.map`. See [The Nix REPL](/learn/nix-repl).
3. **Read the source.** Every lib function has a position:

```sh
nix eval nixpkgs#lib.attrsets --apply 'a: builtins.unsafeGetAttrPos "genAttrs" a'
```

```text
{ column = 3; file = "/nix/store/pzwzs371qflfnkdg37gisaz1pl7qa2jg-source/lib/attrsets.nix"; line = 1351; }
```

Open that file at that line. lib source has doc comments with a `# Type` section above every function, for example `genAttrs :: [String] -> (String -> a) -> { [String] :: a }`, followed by an example. It is the best documentation Nix has.

## Try it

```sh
nix eval nixpkgs#lib.strings --apply 's: s.splitString "." "1.2.3"'
```

```text
[ "1" "2" "3" ]
```

```sh
nix eval --expr 'builtins.split "," "a,b,c"'
```

```text
[ "a" [ ] "b" [ ] "c" ]
```

Same intent, different output. `--apply` lets you call a function from a flake attribute without `--impure`.

## Exercise

Using only builtins, turn `{ nodejs = "22.23.3"; pnpm = "12.3.4"; }` into the single string `"nodejs@22.23.3 pnpm@12.3.4"`.

<details>
<summary>Solution</summary>

```nix
let
  versions = { nodejs = "22.23.3"; pnpm = "12.3.4"; };
  pairs = builtins.attrValues (builtins.mapAttrs (n: v: "${n}@${v}") versions);
in
builtins.concatStringsSep " " pairs
```

```text
"nodejs@22.23.3 pnpm@12.3.4"
```

`mapAttrs` keeps the keys, so `attrValues` is needed to get a list. With `lib` this is one call: `lib.concatStringsSep " " (lib.mapAttrsToList (n: v: "${n}@${v}") versions)`.

</details>

## Trap

`builtins.currentSystem` in a flake. It is not there:

```text
error: attribute 'currentSystem' missing
```

Flakes evaluate in pure mode, and `currentSystem` is impure. That is why every flake hard-codes `system = "x86_64-linux"` or uses `genAttrs` over a list of systems. If a snippet from a blog uses `currentSystem`, it predates flakes or needs `--impure`.

## Checkpoint

```quiz
[
  {"q": "Which is available in nix eval --expr with no nixpkgs?", "options": ["lib.genAttrs", "builtins.mapAttrs", "lib.optional", "pkgs.lib.toUpper"], "answer": 1, "why": "builtins are part of the evaluator; lib is Nix code that lives inside nixpkgs."},
  {"q": "What does lib.genAttrs [ \"a\" \"b\" ] (n: 1) return?", "options": ["[ 1 1 ]", "{ a = 1; b = 1; }", "{ a = \"a\"; b = \"b\"; }", "an error"], "answer": 1, "why": "genAttrs builds an attrset whose keys are the list items and whose values come from the function."},
  {"q": "Why does builtins.split differ from lib.splitString?", "options": ["split is slower", "split is a regex splitter that interleaves capture groups into the result", "splitString only handles single characters", "They are identical"], "answer": 1, "why": "builtins.split returns matches and captures interleaved, so for plain splitting lib.splitString is the right tool."}
]
```
