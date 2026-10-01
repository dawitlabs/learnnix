---
title: Reading errors
stage: 2
order: 13
slug: language-errors
summary: Read a Nix error trace bottom-up, recognise the five common messages, and bisect a broken expression in minutes.
minutes: 18
---

## Why this matters

Nix errors are long, lazy, and point at where a value was forced, not where it was defined. Once you know the shape of a trace and the five messages that account for most failures, a wall of text becomes a two-line read. This lesson uses the real errors you met in earlier lessons.

## Concept

### The shape of a trace

Every error has frames introduced by `…` and one final `error:` line. Frames go from outer context down to the failure. Read it **bottom-up**: the `error:` line says what went wrong, the nearest frame above says where.

```text
error:
       … while evaluating a path segment
         at /tmp/config.nix:8:31:
            7|   prod = prod;
            8|   url = "https://${prod.host}:${prod.port}";
             |                               ^
            9| }

       error: cannot coerce an integer to a string: 3000
```

Bottom line: an integer was used as a string. Frame above: in the interpolation at line 8, column 31. The caret marks the exact `${prod.port}`. Fix: `toString prod.port`.

"Path segment" is Nix's name for one `${}` chunk of a string. It does not mean a filesystem path.

### `--show-trace`

By default Nix trims frames:

```text
(stack trace truncated; use '--show-trace' to show the full, detailed trace)
```

`--show-trace` adds the call-site frames: which function was called from where. Compare the same error from `deep.nix`, which calls `render settings` where `render` reads `s.server.prt`:

Without:

```text
       … while evaluating the attribute 'server.prt'
       error: attribute 'prt' missing
       Did you mean port?
```

With `--show-trace`, two more frames appear above those:

```text
       … from call site
         at /tmp/deep.nix:5:1:
            5| render settings

       … while calling 'render'
         at /tmp/deep.nix:3:12:
            3|   render = s: "port=${toString s.server.prt}";
```

Now you see the caller. In a flake, the extra frames are what tell you which module or overlay introduced a bad value. Always add `--show-trace` on the second attempt.

### The five messages

**`attribute 'x' missing`.** You accessed a key that is not there. Nix suggests near matches (`Did you mean port?`). Causes: typo, `//` dropped a nested set (see [Attrsets](/learn/attrsets-let-with-inherit)), or the value is a different shape than you assumed. Check with `builtins.attrNames`.

**`undefined variable 'x'`.** A bare name with no binding. Causes: used `a` inside a non-`rec` set, forgot `let ... in`, or relied on `with pkgs;` that is out of scope. Also what you get when a `with` is shadowed and you misspelled the shadowing name.

**`infinite recursion encountered`.** A thunk needs itself. Causes: `rec` cycles, an overlay using `self` where `super` was meant, a module option that reads its own value. Different from `stack overflow; max-call-depth exceeded`, which is a function calling itself without a base case. See [Laziness and recursion](/learn/laziness-and-recursion).

**`cannot coerce an integer to a string`.** Interpolation or `+` with a non-string. `toString` it. The variant `cannot add a string to an integer` means the integer was on the left: `1 + "1"`.

**`function 'f' called with unexpected argument 'c'`** and its twin **`called without required argument 'a'`.** Attrset pattern mismatch. Add `...` to accept extras, or fix the call. The error names both the function and the argument. See [Functions](/learn/functions).

Also frequent: `expected a Boolean but found an integer` from `if 1 then`, and `syntax error, unexpected ','` from a comma in a list.

### Printing from inside: `builtins.trace`

`trace msg value` prints `msg` to stderr and returns `value`. Wrap any expression without changing the result:

```nix
let x = 5; in builtins.trace "x is ${toString x}" (x * 2)
```

```text
trace: x is 5
10
```

Non-string messages print as Nix values: `builtins.trace { a = 1; } 42` prints `trace: { a = 1; }`. For a quick look at a value in a pipeline, `lib.debug.traceVal` prints and returns the same thing:

```sh
nix eval nixpkgs#lib.debug.traceVal --apply 'f: f (1 + 1)'
```

```text
trace: 2
2
```

`lib.debug.traceValFn (v: "got ${toString v}")` formats first. `lib.traceSeq` forces the value deeply before printing, so you see contents rather than `«thunk»`.

Because of laziness, a trace only fires if the wrapped value is forced. No output means that code path was never evaluated. That itself is information.

### Bisection

When the trace is not enough:

1. Reproduce in the REPL or `nix eval -f file.nix attr` with the smallest attribute that fails.
2. Replace half the expression with a literal (`"x"`, `{ }`, `[ ]`). Does it still fail? Then the bug is in the other half.
3. Repeat. Three or four rounds narrows a 200-line file to one line.
4. For a flake: `nix eval .#devShells.x86_64-linux.default.name` fails faster than `nix develop`, and `nix flake check` evaluates all outputs.

Parse errors come first and are cheapest: `nix-instantiate --parse file.nix` checks syntax without evaluating anything. A comma in a list or a missing semicolon shows up here with a line and column:

```text
error: syntax error, unexpected '=', expecting ';'
       at /tmp/bad.nix:1:11:
            1| { a = 1 b = 2; }
             |           ^
```

## Try it

```sh
nix eval --expr '{ a = 1; }.b'
```

```text
error: attribute 'b' missing
       at «string»:1:1:
            1| { a = 1; }.b
             | ^
       Did you mean a?
```

```sh
nix eval --expr 'builtins.trace "evaluated" 1 + (let x = builtins.trace "never" 2; in 0)'
```

```text
trace: evaluated
1
```

Only one trace fired. `x` was bound but never used.

## Exercise

This fails. Read the trace, name which of the five messages it is, state the root cause in one sentence, and fix it.

```nix
let
  mkUrl = { host, port }: "https://${host}:${port}";
  cfg = { host = "localhost"; port = 3000; tls = true; };
in
mkUrl cfg
```

<details>
<summary>Solution</summary>

```text
error: function 'mkUrl' called with unexpected argument 'tls'
```

Pattern mismatch: `cfg` has `tls`, the pattern does not accept extras. Add `...`. Then a second error appears: `cannot coerce an integer to a string: 3000`, because `port` is an integer in interpolation. Both fixes:

```nix
let
  mkUrl = { host, port, ... }: "https://${host}:${toString port}";
  cfg = { host = "localhost"; port = 3000; tls = true; };
in
mkUrl cfg
```

```text
"https://localhost:3000"
```

Laziness hid the second error behind the first. Fix, rerun, read again.

</details>

## Trap

Fixing the line the caret points at when the real bug is upstream. `attribute 'prt' missing` at `s.server.prt` is a typo at that line. But `attribute 'port' missing` at the same place means the caller passed a set without `port`, and the fix is in the caller. The caret shows where Nix noticed, which for lazy code is often far from where the wrong value was built. `--show-trace` and `builtins.trace` on the input close that gap.

## Checkpoint

```quiz
[
  {"q": "Where in a Nix trace is the actual failure described?", "options": ["The first line", "The last error: line, with the frame above it giving location", "The middle frame", "In a separate log file"], "answer": 1, "why": "Frames list context from outer to inner; the final error: line states the failure and the nearest frame gives position."},
  {"q": "What does builtins.trace \"msg\" value return?", "options": ["\"msg\"", "null", "value, after printing msg to stderr", "a list of both"], "answer": 2, "why": "trace is transparent: it prints its first argument and returns the second unchanged."},
  {"q": "Why might a builtins.trace print nothing?", "options": ["trace is disabled by default", "The wrapped value was never forced because of laziness", "stderr is buffered", "The message must be a string"], "answer": 1, "why": "A trace fires only when its result is evaluated; an unused thunk never runs."}
]
```
