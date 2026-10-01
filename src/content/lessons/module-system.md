---
title: The module system
stage: 5
order: 28
slug: module-system
summary: Evaluate modules with lib.evalModules and predict how options, mkIf, mkMerge and priorities combine.
minutes: 20
---

## Why this matters

NixOS, home-manager, nix-darwin and flake-parts are all the same function: `lib.evalModules`. Every `configuration.nix` and every `home.nix` you will ever write is an argument to it. You can run that function on Arch right now with nothing but `nixpkgs#lib`. Understand it once and the rest of this course is reading option names.

## Concept

### A module is three attributes

A module is an attrset, or a function returning one, with up to three keys:

- `options` declares what may be set, with a type and a default.
- `config` defines values for declared options.
- `imports` lists other modules to merge in.

Declaration and definition are separate. One module declares `greeting`, any number of modules define it. The module system merges all definitions per option according to the option's type.

```nix
{ lib, ... }:
{
  options.greeting = lib.mkOption {
    type = lib.types.str;
    default = "hello";
    description = "What to print.";
  };
  options.shout = lib.mkOption {
    type = lib.types.bool;
    default = false;
  };
}
```

A second module only defines. Bare attrsets are allowed when you need no arguments:

```nix
{ greeting = "hi dawit"; }
```

Save those as `m1.nix` and `m2.nix`, then evaluate:

```sh
nix eval --impure --json --expr \
  'let lib = (import (builtins.getFlake "nixpkgs") {}).lib;
   in (lib.evalModules { modules = [ ./m1.nix ./m2.nix ]; }).config'
```

```text
{"greeting":"hi dawit","shout":false}
```

`.config` is the merged result. `.options` is the merged declarations. Both exist on the return value.

### The fixpoint: config refers to itself

A module function receives `config`. That is not "the config so far". It is the final merged result, the one still being computed. This is a fixpoint: the output is fed back in as input. Laziness makes it work; you only hit infinite recursion if a value depends on itself.

```nix
{ lib, config, ... }:
{
  options.shout = lib.mkOption { type = lib.types.bool; default = false; };
  options.greeting = lib.mkOption { type = lib.types.str; default = "hello"; };
  options.output = lib.mkOption { type = lib.types.str; };
  config.output = lib.mkIf config.shout (lib.toUpper config.greeting);
}
```

```text
$ nix eval --impure --json --expr '... (lib.evalModules { modules = [ ./fix.nix { shout = true; } ]; }).config'
{"greeting":"hello","output":"HELLO","shout":true}
```

### Why `mkIf`, not `if`

`config = if config.shout then { output = ...; } else { };` breaks. To merge, the module system needs the attribute names of every module's `config` before it knows any values. An `if` around the attrset forces `config.shout`, which needs the merge, which needs the attribute names. Infinite recursion.

`mkIf cond value` keeps the names visible and attaches the condition to the value. The merge step drops definitions whose condition is false. When `shout` is false, `output` simply has no definition:

```text
error: The option `output' was accessed but has no value defined. Try setting the option.
```

### `mkMerge`

Lists and attrsets merge by concatenation and union. `mkMerge` lets one module contribute several definition sets:

```nix
{ lib, ... }:
{
  options.pkgs = lib.mkOption { type = lib.types.listOf lib.types.str; default = []; };
  options.env = lib.mkOption { type = lib.types.attrsOf lib.types.str; default = {}; };
  config = lib.mkMerge [
    { pkgs = [ "git" ]; env.EDITOR = "nvim"; }
    { pkgs = [ "fish" ]; env.PAGER = "less"; }
  ];
}
```

With a third module adding `pkgs = [ "ripgrep" ];`:

```text
{"env":{"EDITOR":"nvim","PAGER":"less"},"pkgs":["ripgrep","git","fish"]}
```

### Priority

A `str` cannot merge two values. Two plain definitions of `greeting` fail:

```text
error: The option `greeting' has conflicting definition values:
- In `<unknown-file>': "b"
- In `<unknown-file>': "a"
Use `lib.mkForce value` or `lib.mkDefault value` to change the priority on any of these definitions.
```

Every definition carries a priority. Lower number wins. Verified in `lib/modules.nix` of nixpkgs 26.11:

| Helper | Priority |
|---|---|
| `mkOptionDefault` (the option's own `default`) | 1500 |
| `mkDefault` | 1000 |
| plain definition | 100 |
| `mkForce` | 50 |
| `mkOverride n` | n |

Same two modules, with `mkDefault "a"` and plain `"b"` gives `"b"`. With `mkForce "a"` and plain `"b"` gives `"a"`. You can read the winning priority: `.options.greeting.highestPrio` returned `50` for the `mkForce` case.

Modules you write should use `mkDefault` for values a user may want to change. Users reach for `mkForce` only to beat a module that was not polite.

### `imports`

`imports` is just more modules. Paths are relative to the file:

```nix
{ imports = [ ./m1.nix ./m2.nix ]; shout = true; }
```

```text
{"greeting":"hi dawit","shout":true}
```

### `options` tells you where a value came from

```text
$ nix eval ... 'let e = lib.evalModules { modules = [ ./m1.nix ./m2.nix ]; };
   in { type = e.options.greeting.type.description; files = e.options.greeting.files; }'
{"files":["/tmp/learnnix-verify/m2.nix"],"type":"string"}
```

This is how `nixos-option` and the option search sites work.

## Try it

1. Create `m1.nix` and `m2.nix` from above in a scratch directory and run the first `nix eval`. Expected: `{"greeting":"hi dawit","shout":false}`.

2. Define `shout = "yes"` in a third module and evaluate `.config.shout`. Types are checked at merge:

```text
error: A definition for option `shout' is not of type `boolean'. Definition values:
- In `<unknown-file>': "yes"
```

3. Misspell an option: `{ greting = "x"; }`.

```text
error: The option `greting' does not exist. Definition values:
- In `<unknown-file>': "x"

Did you mean `greeting' or `shout'?
```

## Exercise

Write a module that declares `user.name` (string, required) and `user.home` (path) whose default is `/home/<name>`. Evaluate it with `{ user.name = "dawit"; }`, then override `user.home` and confirm the override wins without `mkForce`.

<details>
<summary>Solution</summary>

```nix
{ lib, config, ... }:
{
  options.user.name = lib.mkOption { type = lib.types.str; };
  options.user.home = lib.mkOption {
    type = lib.types.path;
    default = "/home/${config.user.name}";
  };
}
```

```text
$ nix eval ... '(lib.evalModules { modules = [ ./ex28.nix { user.name = "dawit"; } ]; }).config'
{"user":{"home":"/home/dawit","name":"dawit"}}

$ nix eval ... '... { user.name = "dawit"; user.home = "/srv/dawit"; } ...).config.user.home'
"/srv/dawit"
```

The `default` sits at priority 1500, so a plain definition at 100 wins. That is the fixpoint in use: the default reads `config.user.name`, which is only known after merging.

</details>

## Trap

Defining the same scalar option in two places without a priority. You will see the "conflicting definition values" error above, usually when a module you imported and your own file both set `programs.git.enable` or `networking.hostName`. Read the two `In` lines, decide which should win, and add `mkDefault` to the one that should lose. Do not reach for `mkForce` first; it hides the next conflict.

## Checkpoint

```quiz
[
  {"q": "A module function receives `config`. What is it?", "options": ["The config defined in modules listed before this one", "The final merged configuration, computed as a fixpoint", "Only this module's own config attribute", "The default values of all options"], "answer": 1, "why": "Every module sees the same final result; laziness lets it be referenced before it is fully computed."},
  {"q": "Two modules set `networking.hostName` to different plain strings. What happens?", "options": ["The last module in the list wins", "The first module wins", "Evaluation fails with a conflicting definition error", "They are concatenated"], "answer": 2, "why": "A string type cannot merge two definitions at equal priority (100); you need mkDefault or mkForce on one."},
  {"q": "Why does `config = if cfg.enable then {...} else {}` cause infinite recursion while `mkIf` does not?", "options": ["`if` is not allowed inside modules", "`if` hides the attribute names until the condition is known, and the condition needs the merge", "`mkIf` runs before evaluation", "`if` only works on booleans from the same module"], "answer": 1, "why": "The merge needs attribute names first; mkIf keeps them visible and attaches the condition to the values instead."}
]
```
