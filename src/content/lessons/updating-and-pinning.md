---
title: Updating and pinning
stage: 3
order: 20
slug: updating-and-pinning
summary: Update one input at a time, pin to exact revisions, review flake.lock diffs, and test an update without committing.
minutes: 12
---

## Why this matters

A dependency bump in nixpkgs can change Node, pnpm and every library at once. With pnpm you would never run `pnpm update` across all packages blind; the same discipline applies here. The lock file is the one place where "what changed" is answered exactly, and the tooling to inspect it is three commands.

## Concept

### The commands, verified on Nix 2.35.2

| Command | Effect |
|---|---|
| `nix flake update` | Re-resolve **every** input to its latest matching ref |
| `nix flake update nixpkgs` | Re-resolve only `nixpkgs` |
| `nix flake update a b` | Only those two |
| `nix flake lock` | Add missing inputs; never change locked ones |
| `nix flake update --commit-lock-file` | Same, plus a git commit with the change summary as message |
| `nix <cmd> --override-input nixpkgs <ref>` | Use another ref for one invocation, lock untouched |

`nix flake lock --update-input nixpkgs` still works and does the same as `nix flake update nixpkgs`.

### Pinning in flake.nix vs the lock

The lock already pins. Pinning in `flake.nix` is for when you want a **ceiling** that updates cannot cross:

```nix
{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/b4fd65b198c599cbe814fcb9f42d25d021595ec9";

  outputs = { self, nixpkgs }: { };
}
```

Now `nix flake update` is a no-op for this input. Use a branch (`nixos-unstable`, `nixos-25.05`) when you want updates to move, a rev when you need a freeze for a reason you can name in a comment.

### Reading a lock diff

A lock change is a JSON diff of the `locked` object. Real diff from switching `nixpkgs` between two sources:

```text
     "nixpkgs": {
       "locked": {
-        "lastModified": 1790689126,
-        "narHash": "sha256-ilerN1WLSvF+HMjziC/Wv99J5y02maDH+6hZPwsORKg=",
-        "owner": "NixOS",
-        "repo": "nixpkgs",
-        "rev": "b4fd65b198c599cbe814fcb9f42d25d021595ec9",
-        "type": "github"
+        "lastModified": 1790652569,
+        "narHash": "sha256-k8Fu4c9Z+4Nh7mUr0cfw++ITQiyEhlWxoJBOkI3tOcQ=",
+        "rev": "b6c8664de9b6cc07fe5666a29f91884ba81197c4",
+        "type": "tarball",
+        "url": "https://releases.nixos.org/nixpkgs/nixpkgs-26.11pre1082290.b6c8664de9b6/nixexprs.tar.zst"
       },
```

Three things to read: `rev` (what changed), `lastModified` (how far you jumped; it is a Unix timestamp, `date -d @1790689126`), and whether `type` changed (here `github` to `tarball`, meaning a different fetch method, not just a different commit). In a PR, `rev` to `rev` on the same `type` is the normal case.

### Try before you commit

`--override-input` is the dry run. It evaluates with a different input and does not write the lock:

```sh
nix flake metadata --override-input nixpkgs flake:nixpkgs
```

```text
Inputs:
└───nixpkgs: https://releases.nixos.org/nixpkgs/nixpkgs-26.11pre1082290.b6c8664de9b6/nixexprs.tar.zst?narHash=sha256-k8Fu4c9Z%2B4Nh7mUr0cfw%2B%2BITQiyEhlWxoJBOkI3tOcQ%3D (2026-09-29 03:29:29)
```

The same flag works on `nix build`, `nix develop` and `nix flake check`. Build with the candidate nixpkgs, run the test suite, then `nix flake update nixpkgs` for real.

### Commit the lock, always

The lock is the reproducibility. An uncommitted lock means CI resolves `nixos-unstable` to a different commit than you did. Commit `flake.lock` in the same commit as the `flake.nix` change that caused it, or use `--commit-lock-file` and let Nix write the message.

## Try it

In a flake directory with a committed lock:

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

Then update only nixpkgs:

```sh
nix flake update nixpkgs
git diff --stat
```

Both printed nothing when verified: the lock was already at the newest `nixos-unstable` commit. When it is not, Nix prints an `Updated input 'nixpkgs'` block with old and new rev, and `git diff` shows the JSON change.

## Exercise

Without editing any file, evaluate your flake's default package name against the registry's nixpkgs instead of the locked one, and confirm the lock file is unchanged afterwards.

<details>
<summary>Solution</summary>

```sh
nix eval .#packages.x86_64-linux.default.name --override-input nixpkgs flake:nixpkgs
git status --short flake.lock
```

The first prints the package name as built from the overriding nixpkgs. The second prints nothing: `--override-input` never writes the lock. If `git status` shows `M flake.lock`, you ran a command without the override that added a missing input; `git checkout flake.lock` restores it.

</details>

## Trap

Running bare `nix flake update` to bump nixpkgs. It also bumps `home-manager`, `flake-utils` and every other input, so the diff mixes an intended change with unrelated ones, and a breakage is hard to attribute. Recognise it by a lock diff touching more than one node. Fix: `git checkout flake.lock` and rerun with the input name.

## Checkpoint

```quiz
[
  {"q": "Which command updates only nixpkgs?", "options": ["nix flake update", "nix flake update nixpkgs", "nix flake lock", "nix flake metadata"], "answer": 1, "why": "Positional input names restrict nix flake update to those inputs; bare update touches all."},
  {"q": "What does `--override-input nixpkgs <ref>` write to flake.lock?", "options": ["The new rev", "Nothing", "A follows edge", "The narHash only"], "answer": 1, "why": "override-input affects only the current invocation; the lock file is untouched."},
  {"q": "In a lock diff, which field tells you how far in time you jumped?", "options": ["narHash", "type", "lastModified", "owner"], "answer": 2, "why": "lastModified is the Unix timestamp of the locked commit; compare old and new with date -d @N."}
]
```
