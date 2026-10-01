---
title: Flake templates
stage: 3
order: 19
slug: flake-templates
summary: Scaffold new projects from official or personal templates with nix flake init and nix flake new.
minutes: 10
---

## Why this matters

Every new SvelteKit repo needs the same `flake.nix` and `.envrc`. Templates make that a one-liner, the way `pnpm create svelte` does for the app itself. A template is just files inside a flake plus a `templates` output, so a personal template repo on GitHub becomes `nix flake init -t github:you/templates#sveltekit`.

## Concept

### The `templates` output

```nix
{
  outputs = { self }: {
    templates.sveltekit = {
      path = ./sveltekit;
      description = "SvelteKit + Turso dev shell (Node 22, pnpm, biome, turso-cli)";
    };

    templates.default = self.templates.sveltekit;
  };
}
```

- `path` is a directory in the flake. Its contents get copied verbatim.
- `description` is what `nix flake show` prints.
- `templates.default` is used when you omit `#name`.
- Optional `welcomeText` is markdown printed after copying.

The directory `sveltekit/` here holds the dev shell flake from [Dev shells in depth](/learn/dev-shells-deep) plus a one-line `.envrc` containing `use flake`. Because the template flake has no inputs, it has no lock file of its own.

### `init` vs `new`

Both verified with `--help` on Nix 2.35:

- `nix flake init [-t template]` — copy into the **current** directory.
- `nix flake new dest-dir [-t template]` — create `dest-dir` and copy into it.

`-t` / `--template` takes a flake reference plus optional `#name`: `-t .#sveltekit`, `-t github:you/templates#sveltekit`, `-t templates#devshell`.

### The official templates

`templates` is a registry alias for `github:NixOS/templates`. Listing it downloads a small repo:

```sh
nix flake show templates
```

```text
github:NixOS/templates/3348e5b68b7a53c1ef9d20605c3cad169f65899a?narHash=sha256-rXxoCHYrbc88qJYwIfJaz0v4bx2Eb9R4fEO5XRSI/hs%3D
├───defaultTemplate: template: A very basic flake
└───templates
    ├───bash-hello: template: An over-engineered Hello World in bash
    ├───c-hello: template: An over-engineered Hello World in C
    ├───compat: template: A default.nix and shell.nix for backward compatibility with Nix installations that don't support flakes
    ├───devshell: template: A basic flake providing a devShell
    ├───dotnet: template: A .NET application and test project
    ├───empty: template: A flake with no outputs
    ├───full: template: A template that shows all standard flake outputs
    ├───go-hello: template: A simple Go package
    ├───haskell-flake: template: A haskell-flake template
```

(Trimmed with `head`.) `full` is worth reading once: it shows every standard output.

### What a template does not do

It does not run `git init`, does not `git add`, and does not fetch inputs. After `nix flake init`, the next commands are always `git init && git add .` and then `nix develop` or `direnv allow`. Copying is the entire feature.

### Personal template repo layout

```text
templates/
├── flake.nix          # the templates output
├── sveltekit/
│   ├── flake.nix
│   └── .envrc
└── go-cli/
    ├── flake.nix
    └── .envrc
```

Push it to GitHub. From then on: `nix flake new my-app -t github:you/templates#sveltekit`.

## Try it

Create the template flake and a `sveltekit/` directory with a `flake.nix` and `.envrc`, `git add` everything, then scaffold a project from it:

```sh
nix flake show
```

```text
git+file:///tmp/lx19-tGy5
└───templates
    ├───default: template: SvelteKit + Turso dev shell (Node 22, pnpm, biome, turso-cli)
    └───sveltekit: template: SvelteKit + Turso dev shell (Node 22, pnpm, biome, turso-cli)
```

```sh
mkdir /tmp/my-app && cd /tmp/my-app
nix flake init -t /tmp/lx19-tGy5#sveltekit
ls -A
```

```text
wrote: "/tmp/lxproj-v6bN/.envrc"
wrote: "/tmp/lxproj-v6bN/flake.nix"
.envrc
flake.nix
```

`nix flake new /tmp/other -t /tmp/lx19-tGy5#sveltekit` prints the same two `wrote:` lines into a fresh directory.

## Exercise

Add a `welcomeText` to the `sveltekit` template that reminds you to run `git init && git add . && direnv allow`. Check `nix flake check --no-build` still passes and run `nix flake init` again in an empty directory to see the text.

<details>
<summary>Solution</summary>

```nix
{
  outputs = { self }: {
    templates.sveltekit = {
      path = ./sveltekit;
      description = "SvelteKit + Turso dev shell (Node 22, pnpm, biome, turso-cli)";
      welcomeText = ''
        # SvelteKit shell ready

        Next:

            git init && git add . && direnv allow
      '';
    };

    templates.default = self.templates.sveltekit;
  };
}
```

`welcomeText` is markdown. Nix prints it after the `wrote:` lines.

</details>

## Trap

`nix flake init` refuses to overwrite a file whose content differs. Identical files are silently skipped; a changed `flake.nix` produces:

```text
refusing to overwrite existing file "/tmp/lxproj-v6bN/flake.nix"
 please merge it manually with '/tmp/lx19-tGy5/sveltekit/flake.nix'
error: encountered 1 conflicts - see above
```

It also copies hidden files like `.envrc`, which `ls` without `-A` hides, so a template can look like it copied nothing. Recognise it by checking `ls -A`, not `ls`.

## Checkpoint

```quiz
[
  {"q": "What does `nix flake init -t .#sveltekit` do?", "options": ["Clones the flake into a new directory", "Copies the files under templates.sveltekit.path into the current directory", "Runs nix develop", "Creates flake.lock"], "answer": 1, "why": "init only copies the template directory into the cwd; git and inputs are your job."},
  {"q": "Which command creates the destination directory for you?", "options": ["nix flake init", "nix flake new", "nix flake clone", "nix flake show"], "answer": 1, "why": "nix flake new dest-dir creates dest-dir; init works in the current directory."},
  {"q": "Why does the templates flake above have no flake.lock?", "options": ["Templates never need one", "It declares no inputs, so there is nothing to lock", "It is a bug", "Lock files are optional for all flakes"], "answer": 1, "why": "A lock file records resolved inputs; a flake with no inputs has nothing to record."}
]
```
