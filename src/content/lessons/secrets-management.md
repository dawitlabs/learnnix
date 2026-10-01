---
title: Secrets management
stage: 6
order: 37
slug: secrets-management
summary: Keep tokens out of the Nix store with agenix or sops-nix and hand them to services at runtime.
minutes: 15
---

## Why this matters

The bot's Telegram token currently sits in a `.env` on the VPS. In NixOS the obvious move, `environment.TELEGRAM_TOKEN = "123:abc"` in the service, puts the token into `/nix/store`, where every user and every machine you copy the closure to can read it. This lesson is about why that is unfixable after the fact and what the two standard tools do instead.

## Concept

### The store is public by design

On this machine:

```text
$ stat -c '%A %U %G %n' /nix/store
drwxrwxr-t root nixbld /nix/store
$ stat -c '%A %U %G %n' "$(nix eval --raw nixpkgs#path)/flake.nix"
-r--r--r-- root root /nix/store/1lv9wbcx...-source/flake.nix
```

Every path is world-readable. That is what lets any user run any package. It also means a string inside any derivation, including the rendered `claimbot.service` from [Services and systemd](/learn/services-and-systemd), is readable by any local account. Worse:

- The path is part of the system closure, so `nix copy` and `nixos-rebuild --target-host` ship it to other hosts and caches.
- It lives in every old generation until garbage collection.
- Store paths are content-addressed by hash. Rotating the token creates a new path; the old one is still there.

Rule: a secret may be referenced by path from the store, never contained in it.

### The shape both tools share

1. You generate an `age` key pair per host (or derive one from the host's SSH host key).
2. Secrets are encrypted to those public keys and committed to the repo. Ciphertext in git is fine.
3. A NixOS module decrypts at activation, using the host's private key which never leaves the host, into a `tmpfs` under `/run`.
4. Services read the decrypted file by path.

The encrypted file goes through the store; the decrypted file does not.

### agenix

Simplest. One secret per `.age` file. A `secrets.nix` at the repo root lists which public keys may decrypt which file:

```nix
let
  laptop = "ssh-ed25519 AAAA...laptop";
  vps = "ssh-ed25519 AAAA...vps";
in
{
  "claimbot.env.age".publicKeys = [ laptop vps ];
}
```

`agenix -e claimbot.env.age` opens an editor, encrypts on save. In the host config:

```nix
{ config, ... }:
{
  age.secrets."claimbot.env".file = ../secrets/claimbot.env.age;

  systemd.services.claimbot.serviceConfig.EnvironmentFile =
    config.age.secrets."claimbot.env".path;
}
```

Decrypted to `/run/agenix/claimbot.env`, root-owned, mode 0400 by default. `age.secrets.<name>.owner`, `.group` and `.mode` adjust that. The host's SSH host key at `/etc/ssh/ssh_host_ed25519_key` is the default identity, so a fresh host can decrypt as soon as its host key is in `secrets.nix`.

Verify: option names `age.secrets.<name>.file`, `.path`, `.owner`, `.mode` and `age.identityPaths` at https://github.com/ryantm/agenix#reference. The module is `inputs.agenix.nixosModules.default`, imported via `specialArgs` as in [Flake-based NixOS](/learn/flake-based-nixos). The CLI exists in nixpkgs as `agenix-cli` (version 0.1.2 in your pinned revision).

### sops-nix

More machinery, more features. Secrets are keys inside one YAML or JSON file encrypted with `sops`; only values are encrypted, so `git diff` shows which key changed. Supports age, GPG and cloud KMS, and can set file ownership and render templates.

```nix
{ config, ... }:
{
  sops.defaultSopsFile = ../secrets/vps.yaml;
  sops.age.keyFile = "/var/lib/sops-nix/key.txt";

  sops.secrets.telegram_token = { };
  sops.secrets."claimbot.env" = { };

  systemd.services.claimbot.serviceConfig.EnvironmentFile =
    config.sops.secrets."claimbot.env".path;
}
```

Decrypted to `/run/secrets/<name>`, root-owned by default; `EnvironmentFile` is read by systemd as root before the service drops to its `DynamicUser`, so no `owner` is needed here. The `.sops.yaml` at the repo root maps file globs to recipient keys, like agenix's `secrets.nix`. `ssh-to-age` converts an SSH host key to an age recipient so you can reuse host keys here too.

Verify: `sops.defaultSopsFile`, `sops.age.keyFile`, `sops.secrets.<name>.owner`, `.path`, and `sops.templates` at https://github.com/Mic92/sops-nix. `sops` 3.13.3 and `age` 1.3.2 are in your pinned nixpkgs.

### Choosing

- One or two hosts, a handful of secrets, you want to understand every piece: agenix.
- Many secrets, want them grouped per host in one file, need per-key diffs or templates that interpolate several secrets into one config: sops-nix.

Both are fine. Switching later is an afternoon.

### Handing a secret to a service

`EnvironmentFile` reads `KEY=value` lines into the service environment. Simple, but the environment is visible to the process and anything it spawns.

`LoadCredential` is systemd's stricter path. It copies the file into a per-service directory and exposes it as `$CREDENTIALS_DIRECTORY/<id>`:

```nix
{ config, ... }:
{
  systemd.services.claimbot.serviceConfig.LoadCredential = [
    "token:${config.age.secrets.telegram_token.path}"
  ];
}
```

The bot then reads `os.environ["CREDENTIALS_DIRECTORY"] + "/token"`. Works with `DynamicUser` because systemd, not the service user, does the copy. Prefer it for new code; use `EnvironmentFile` when the program only knows how to read env vars.

## Try it

1. Check the store's permissions yourself:

```sh
stat -c '%A %U %G %n' /nix/store
```

```text
drwxrwxr-t root nixbld /nix/store
```

2. Confirm the tools are in your pinned nixpkgs, no download beyond evaluation:

```sh
nix eval --raw nixpkgs#sops.version; echo; nix eval --raw nixpkgs#age.version; echo; nix eval --raw nixpkgs#agenix-cli.version
```

```text
3.13.3
1.3.2
0.1.2
```

3. Prove the leak. Write a module with `environment.variables.TOKEN = "leaked";`, evaluate `.config.environment.variables.TOKEN` through your Try-it flake, and reason about where that string would end up after a build: in `/etc/profile` inside the system closure, world-readable.

## Exercise

Decide, for the bot: which tool, which secret files, which delivery mechanism. Write the host-side module for your choice with a `Verify` comment for every option name you have not checked.

<details>
<summary>Solution</summary>

One defensible answer: agenix, one file `claimbot.env.age` containing `TELEGRAM_TOKEN=...`, delivered by `EnvironmentFile` because python-telegram-bot reads the env.

```nix
{ config, ... }:
{
  # Verify: age.secrets.<name>.file and .path against the agenix README
  age.secrets."claimbot.env".file = ../secrets/claimbot.env.age;

  systemd.services.claimbot.serviceConfig.EnvironmentFile =
    config.age.secrets."claimbot.env".path;
}
```

Plus `secrets.nix` listing the VPS host key and your laptop key, and `imports = [ inputs.agenix.nixosModules.default ];` in the host.

</details>

## Trap

`builtins.readFile ./token.txt` or `environment.etc."bot.env".text = "TOKEN=..."` to "keep it out of git". The gitignore protects the repo; the store is still public, and `nix copy` still ships it. If a secret ever enters the store, rotate it. Deleting the generation is not enough until `nix-collect-garbage` has run on every machine that received the closure.

## Checkpoint

```quiz
[
  {"q": "Why is a secret inside a NixOS derivation a problem even on a single-user VPS?", "options": ["Nix encrypts the store, so it is not", "The store is world-readable, ships with the closure, and persists in old generations", "It slows down builds", "systemd refuses to start it"], "answer": 1, "why": "Store paths are public by design and travel wherever the closure goes."},
  {"q": "What is committed to git with agenix or sops-nix?", "options": ["Nothing; secrets stay on the host", "The plaintext, in a gitignored file", "Ciphertext encrypted to the hosts' public keys", "A hash of the secret"], "answer": 2, "why": "Ciphertext is safe in the repo; decryption happens on the host at activation."},
  {"q": "What advantage does LoadCredential have over EnvironmentFile?", "options": ["It works without systemd", "The secret is not in the process environment and works with DynamicUser", "It encrypts the file", "It is faster"], "answer": 1, "why": "systemd copies the credential into a private directory; the service reads it by path instead of inheriting it as an env var."}
]
```
