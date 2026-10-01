---
title: Write your own module
stage: 5
order: 32
slug: write-your-own-module
summary: Design an enable-gated module with typed, documented options, submodules and a modules/ directory.
minutes: 20
---

## Why this matters

Every `programs.fish` or `services.openssh` you have used is a file like the one you are about to write. Once your config grows past one `home.nix`, the way to keep it readable is the same way nixpkgs does it: small modules, each owning one `options.*` namespace, gated by `enable`. Everything here is verified with `lib.evalModules` on Arch.

## Concept

### The shape

```nix
{ lib, config, ... }:
let
  cfg = config.my.dev;
in
{
  options.my.dev = {
    enable = lib.mkEnableOption "my dev environment";
    editor = lib.mkOption {
      type = lib.types.str;
      default = "nvim";
      description = "Default editor.";
    };
  };

  config = lib.mkIf cfg.enable {
    # definitions go here
  };
}
```

Four conventions, each load-bearing:

- `cfg = config.my.dev` reads from the fixpoint. See [The module system](/learn/module-system).
- `mkEnableOption "x"` is `mkOption { type = bool; default = false; example = true; description = "Whether to enable x."; }`. Verified: evaluating `options.my.dev.enable.description` gives `"Whether to enable my dev environment."`.
- `config = mkIf cfg.enable { ... }` wraps the whole block, so a disabled module contributes nothing.
- Own a namespace. `my.*` will never collide with nixpkgs.

### Submodules: typed records

A submodule is a module used as a type. `attrsOf (submodule ...)` gives you a dictionary of typed records, like `users.users` or `fileSystems`.

```nix
{ lib, config, ... }:
let
  cfg = config.my.dev;
  projectType = lib.types.submodule {
    options = {
      path = lib.mkOption {
        type = lib.types.str;
        description = "Directory of the project.";
      };
      runtime = lib.mkOption {
        type = lib.types.enum [ "node" "python" "rust" ];
        default = "node";
        description = "Primary runtime.";
      };
      ports = lib.mkOption {
        type = lib.types.listOf lib.types.port;
        default = [ ];
        description = "Dev server ports.";
      };
    };
  };
in
{
  options.my.dev = {
    enable = lib.mkEnableOption "my dev environment";
    editor = lib.mkOption {
      type = lib.types.str;
      default = "nvim";
      description = "Default editor.";
    };
    projects = lib.mkOption {
      type = lib.types.attrsOf projectType;
      default = { };
      description = "Projects keyed by name.";
    };
  };

  options.result = lib.mkOption {
    type = lib.types.attrsOf lib.types.anything;
    default = { };
  };

  config = lib.mkIf cfg.enable {
    result.EDITOR = cfg.editor;
    result.projectDirs = lib.mapAttrsToList (_: p: p.path) cfg.projects;
    result.allPorts = lib.concatMap (p: p.ports) (lib.attrValues cfg.projects);
  };
}
```

`result` stands in for whatever a real module would set: `home.packages`, `systemd.services`, `environment.variables`.

A user module:

```nix
{
  my.dev.enable = true;
  my.dev.projects.lineup = {
    path = "~/dev/lineup";
    ports = [ 5173 ];
  };
  my.dev.projects.bot = {
    path = "~/dev/bot";
    runtime = "python";
  };
}
```

```text
$ nix eval --impure --json --expr 'let lib = (import (builtins.getFlake "nixpkgs") {}).lib;
    in (lib.evalModules { modules = [ ./my-dev.nix ./my-dev-use.nix ]; }).config'
{"my":{"dev":{"editor":"nvim","enable":true,"projects":{"bot":{"path":"~/dev/bot","ports":[],"runtime":"python"},"lineup":{"path":"~/dev/lineup","ports":[5173],"runtime":"node"}}}},"result":{"EDITOR":"nvim","allPorts":[5173],"projectDirs":["~/dev/bot","~/dev/lineup"]}}
```

Defaults inside the submodule were filled in (`ports: []`, `runtime: "node"`). Without the user module, `.config.result` is `{}`: the `mkIf` held.

### Types do the validation

`runtime = "go"`:

```text
error: A definition for option `my.dev.projects.x.runtime' is not of type `one of "node", "python", "rust"'. Definition values:
- In `<unknown-file>': "go"
```

A project with no `path`:

```text
error: The option `my.dev.projects.x.path' was accessed but has no value defined. Try setting the option.
```

An option with no `default` is required. That error only fires when something reads it; laziness means an unused bad definition can hide until a later refactor touches it.

Common types and what they merge to:

| Type | Merge behaviour |
|---|---|
| `bool`, `str`, `int`, `enum` | one definition, or conflict |
| `listOf t` | concatenation, ordered by `mkBefore`/`mkAfter` |
| `attrsOf t` | union, each value merged by `t` |
| `lines` | concatenated with newlines |
| `nullOr t` | `null` or `t` |
| `submodule` | each field merged by its own type |

Full table in the [module reference](/reference/modules).

### Documenting

`description` is not decoration. NixOS and home-manager render it into the manual and option search. Write it as a sentence that ends with a period. Add `example` for anything non-obvious; `mkOption { example = { g = "git"; }; }` shows up next to the type. Mark internal plumbing with `internal = true` so it is hidden from generated docs.

### Splitting into a directory

```nix
{
  imports = [
    ./modules/greeting.nix
    ./modules/pkgs.nix
  ];
  greeting = "split";
}
```

```text
{"env":{"EDITOR":"nvim","PAGER":"less"},"greeting":"split","pkgs":["git","fish"],"shout":false}
```

One file per namespace: `modules/dev.nix` owns `my.dev`, `modules/shell.nix` owns `my.shell`. The root file only imports and sets values. Do not import a directory path; Nix resolves `./modules` to `./modules/default.nix`, which is fine if that file exists and itself imports the rest, confusing if it does not.

## Try it

1. Save the two modules as `my-dev.nix` and `my-dev-use.nix` and run the `nix eval` above. Expected output is the JSON shown.

2. Evaluate with the module disabled:

```sh
nix eval --impure --json --expr 'let lib = (import (builtins.getFlake "nixpkgs") {}).lib; in (lib.evalModules { modules = [ ./my-dev.nix ]; }).config.result'
```

```text
{}
```

3. Read the generated description:

```sh
nix eval --impure --json --expr 'let lib = (import (builtins.getFlake "nixpkgs") {}).lib; in (lib.evalModules { modules = [ ./my-dev.nix ]; }).options.my.dev.enable.description'
```

```text
"Whether to enable my dev environment."
```

## Exercise

Write `my.shell` with `enable`, `kind` (enum of `fish`, `zsh`, default `fish`) and `aliases` (`attrsOf str`). Render the aliases to a `lines` option called `rendered` as fish `alias name 'cmd'` lines, only when enabled.

<details>
<summary>Solution</summary>

```nix
{ lib, config, ... }:
let
  cfg = config.my.shell;
in
{
  options.my.shell = {
    enable = lib.mkEnableOption "shell setup";
    kind = lib.mkOption {
      type = lib.types.enum [ "fish" "zsh" ];
      default = "fish";
      description = "Login shell.";
    };
    aliases = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = { g = "git"; };
      description = "Shell aliases.";
    };
  };
  options.rendered = lib.mkOption {
    type = lib.types.lines;
    default = "";
  };
  config = lib.mkIf cfg.enable {
    rendered = lib.concatStringsSep "\n" (
      lib.mapAttrsToList (name: cmd: "alias ${name} '${cmd}'") cfg.aliases
    );
  };
}
```

```text
$ nix eval --impure --raw --expr '... { my.shell.enable = true; my.shell.aliases = { g = "git"; ll = "ls -la"; }; } ...).config.rendered'
alias g 'git'
alias ll 'ls -la'
```

Setting `kind = "bash"` fails with `not of type 'one of "fish", "zsh"'`.

</details>

## Trap

Writing `config.result.EDITOR = lib.mkIf cfg.enable cfg.editor;` per attribute instead of one `mkIf` around the block, then adding a new attribute and forgetting its guard. The module now leaks a definition while disabled, and the first symptom is a conflict in some unrelated host that never enabled it. One `config = lib.mkIf cfg.enable { ... };` makes forgetting impossible.

## Checkpoint

```quiz
[
  {"q": "What does `lib.mkEnableOption \"foo\"` produce?", "options": ["A bool option defaulting to true", "A bool option defaulting to false with a generated description", "A string option", "A function that enables foo"], "answer": 1, "why": "It is shorthand for mkOption with type bool, default false, example true and description 'Whether to enable foo.'"},
  {"q": "What is `types.attrsOf (types.submodule {...})` used for?", "options": ["A single typed record", "A list of strings", "A dictionary of typed records, like users.users", "An enum"], "answer": 2, "why": "Each attribute value is checked and merged against the submodule's own options."},
  {"q": "An option has no `default`. When does the missing-value error fire?", "options": ["Immediately at module load", "Only when some other code reads the option", "Never; it becomes null", "Only in NixOS, not evalModules"], "answer": 1, "why": "Evaluation is lazy; the error appears when the value is forced, which can be later than you expect."}
]
```
