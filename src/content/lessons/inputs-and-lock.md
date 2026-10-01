---
title: Inputs and the lock file
stage: 3
order: 15
slug: inputs-and-lock
summary: Declare inputs in every URL form, dedupe nixpkgs with follows, and read flake.lock line by line.
minutes: 14
---

## Why this matters

Inputs are your dependency list and `flake.lock` is your lockfile. You already reason about this with pnpm: one lockfile, exact versions, deliberate updates. The difference is that a Nix input can be an entire package repository, so one careless update can rebuild everything. Knowing the lock format lets you review it in a PR like any other diff.

## Concept

### Input URL forms

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-pinned.url = "github:NixOS/nixpkgs/b4fd65b198c599cbe814fcb9f42d25d021595ec9";
    home-manager.url = "github:nix-community/home-manager/release-25.05";
    my-lib.url = "git+https://git.example.com/me/lib.git?ref=main";
    local.url = "path:./subflake";
    indirect.url = "nixpkgs";
  };

  outputs = inputs: { };
}
```

- `github:owner/repo[/ref-or-rev]` — fetches a tarball through the GitHub API. Fastest. `ref` can be a branch, tag or full commit hash.
- `git+https://...?ref=...&rev=...` — real git clone. Works for any host and for submodules (`?submodules=1`).
- `path:./dir` — a local directory. Not copied to the store with git filtering.
- `nixpkgs` with no scheme — an **indirect** reference resolved through the flake registry (`nix registry list`). Fine for scratch work, bad for reproducibility because the registry is machine state.

### Non-flake inputs

Any repository can be an input even if it has no `flake.nix`:

```nix
{
  inputs.fish-plugin = {
    url = "github:PatrickF1/fzf.fish";
    flake = false;
  };

  outputs = { self, fish-plugin }: {
    pluginSource = fish-plugin.outPath;
  };
}
```

With `flake = false` you get a plain source tree: `outPath`, `rev`, `lastModified`. No outputs.

### `follows`: one nixpkgs, not five

Every input that itself depends on nixpkgs brings its own pinned copy. Three inputs means three nixpkgs downloads and three evaluations. `follows` rewires a transitive input to one of yours:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
    flake-utils = {
      url = "github:numtide/flake-utils";
      inputs.systems.follows = "systems";
    };
  };

  outputs = inputs: { };
}
```

Now `flake-utils/systems` is an alias for your `systems`. The same pattern for `home-manager.inputs.nixpkgs.follows = "nixpkgs"` is what keeps a Home Manager setup to one nixpkgs.

### Reading flake.lock

The lock is a graph of **nodes**. Real file produced by the flake above:

```text
{
  "root": {
    "inputs": {
      "flake-utils": "flake-utils",
      "nixpkgs": "nixpkgs",
      "systems": "systems"
    }
  },
  "flake-utils": {
    "inputs": {
      "systems": [
        "systems"
      ]
    },
    "locked": {
      "lastModified": 1731533236,
      "narHash": "sha256-l0KFg5HjrsfsO/JpG+r7fRrqm12kzFHyUHqHCVpMMbI=",
      "owner": "numtide",
      "repo": "flake-utils",
      "rev": "11707dc2f618dd54ca8739b309ec4fc024de578b",
      "type": "github"
    },
    "original": {
      "owner": "numtide",
      "repo": "flake-utils",
      "type": "github"
    }
  }
}
```

(Output trimmed to two nodes with `jq`.) Read it like this:

- `root.inputs` maps your input names to node ids.
- `original` is what you wrote in `flake.nix`.
- `locked` is what Nix resolved: exact `rev`, and `narHash`, the hash of the fetched tree. The hash is what makes the lock trustworthy; the rev alone is not enough for a tarball.
- `"systems": ["systems"]` as a list instead of a string is a `follows` edge: it is a path from root, not a node id.

### Updating

Verified on Nix 2.35.2 with `nix flake update --help`:

- `nix flake update` — re-resolves **every** input. Expect a large diff.
- `nix flake update nixpkgs` — only that input. This is the modern form.
- `nix flake lock` — adds missing inputs to the lock, changes nothing already locked.
- `nix flake lock --update-input nixpkgs` still exists but is the older spelling of the same thing.

[Updating and pinning](/learn/updating-and-pinning) goes deeper.

## Try it

In the flake directory from [Flake anatomy](/learn/flake-anatomy):

```sh
nix flake metadata --json | jq '.locks.nodes.nixpkgs.locked | {rev, lastModified, narHash}'
```

```text
{
  "rev": "b4fd65b198c599cbe814fcb9f42d25d021595ec9",
  "lastModified": 1790689126,
  "narHash": "sha256-ilerN1WLSvF+HMjziC/Wv99J5y02maDH+6hZPwsORKg="
}
```

Ask Nix to update an input that does not exist. It warns, it does not error:

```sh
nix flake update bogus
```

```text
warning: 'bogus' does not match any input of this flake
```

## Exercise

Write a `flake.nix` with two inputs: `nixpkgs` (nixos-unstable) and `nixpkgs-stable` (the `nixos-25.05` branch). Make `outputs` return `{ stable = nixpkgs-stable.lib.version; unstable = nixpkgs.lib.version; }`. Do not run it yet if you want to save bandwidth; just check it parses with `nix-instantiate --parse flake.nix`.

<details>
<summary>Solution</summary>

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-stable.url = "github:NixOS/nixpkgs/nixos-25.05";
  };

  outputs = { self, nixpkgs, nixpkgs-stable }: {
    stable = nixpkgs-stable.lib.version;
    unstable = nixpkgs.lib.version;
  };
}
```

Running `nix eval .#stable` would download a second nixpkgs tree (tens of MB). Two nixpkgs inputs is a legitimate pattern when one package is broken on unstable.

</details>

## Trap

An output argument you did not declare is silently turned into an input. This flake has no `inputs` block at all:

```nix
{
  outputs = { self, nixpkgs }: { x = 1; };
}
```

`nix eval .#x` prints `1` after adding an **implicit** input resolved through the registry:

```text
warning: not writing modified lock file of flake 'git+file:///tmp/lxJ-ddvG':
• Added input 'nixpkgs':
    'https://releases.nixos.org/nixpkgs/nixpkgs-26.11pre1082290.b6c8664de9b6/nixexprs.tar.zst?narHash=sha256-k8Fu4c9Z%2B4Nh7mUr0cfw%2B%2BITQiyEhlWxoJBOkI3tOcQ%3D' (2026-09-29)
1
```

It works on your machine and fails on a machine with a different registry. Always declare `inputs.nixpkgs.url` explicitly.

## Checkpoint

```quiz
[
  {"q": "What does `inputs.flake-utils.inputs.systems.follows = \"systems\"` do?", "options": ["Downloads systems twice", "Makes flake-utils use your `systems` input instead of its own pinned copy", "Disables the systems input", "Pins systems to a rev"], "answer": 1, "why": "follows rewires a transitive input to one of your top-level inputs so there is a single copy."},
  {"q": "In flake.lock, which field guarantees the fetched content is what was locked?", "options": ["original.ref", "locked.lastModified", "locked.narHash", "root"], "answer": 2, "why": "narHash is the content hash of the fetched tree; a rev alone does not verify tarball contents."},
  {"q": "Which command updates only nixpkgs on Nix 2.35?", "options": ["nix flake update", "nix flake update nixpkgs", "nix flake lock", "nix flake metadata nixpkgs"], "answer": 1, "why": "nix flake update with input names as positional arguments updates only those inputs; bare nix flake update updates all."}
]
```
