---
title: Deploy to the VPS
stage: 6
order: 38
slug: deploy-to-vps
summary: Convert the VPS to NixOS with nixos-anywhere, then push every change from your laptop with nixos-rebuild --target-host.
minutes: 20
---

## Why this matters

The VPS is small and has no console you trust. Building on it is slow; debugging a half-applied config over SSH is worse. NixOS lets you build the whole system on the laptop, copy a closure, and activate atomically, with a rollback that is one command. Every tool here exists in your pinned nixpkgs, and all of them run from Arch.

## Concept

### Step one: get NixOS onto a Debian box

`nixos-anywhere` turns a running Linux VPS into NixOS over SSH. It uploads a NixOS installer, `kexec`s into it (replacing the running kernel without a reboot), partitions the disk with disko, installs your flake's configuration, and reboots. Run from the laptop:

```sh
nix run nixpkgs#nixos-anywhere -- --flake .#vps root@203.0.113.10
```

Requirements: root SSH to the current OS, enough RAM to hold the installer (2 GB is comfortable, 1 GB works with care), and a disk layout declared with disko. Everything on the disk is destroyed. Verify: `nix run nixpkgs#nixos-anywhere -- --help`; version 1.13.0 in your lock.

### disko: the disk layout as a module

Partitioning is the one thing `configuration.nix` does not cover; `hardware-configuration.nix` describes partitions that already exist. disko declares them so the installer can create them:

```nix
{
  disko.devices.disk.main = {
    device = "/dev/vda";
    type = "disk";
    content = {
      type = "gpt";
      partitions = {
        boot = {
          size = "512M";
          type = "EF00";
          content = {
            type = "filesystem";
            format = "vfat";
            mountpoint = "/boot";
          };
        };
        root = {
          size = "100%";
          content = {
            type = "filesystem";
            format = "ext4";
            mountpoint = "/";
          };
        };
      };
    };
  };
}
```

disko also generates the matching `fileSystems` entries, so you do not write them twice. Verify: this follows the disko README examples; the device name on your VPS (`/dev/vda` or `/dev/sda`) comes from `lsblk` on the current OS. Module: `inputs.disko.nixosModules.disko`; package `disko` 1.13.0 in your lock.

### Step two: every later change

`nixos-rebuild` can activate on another machine. From the laptop:

```sh
nixos-rebuild switch --flake .#vps --target-host dawit@203.0.113.10 --sudo
```

What happens: the laptop evaluates and builds `nixosConfigurations.vps`, copies the resulting closure over SSH with `nix copy`, and runs the activation on the VPS with sudo. The VPS never evaluates Nix and never needs the repo.

Flags, verified in `nixos-rebuild-ng` which is what `pkgs.nixos-rebuild` is in your lock:

- `--target-host user@host`: where to activate.
- `--build-host user@host`: where to build. Omit it and the laptop builds, which is what you want with a small VPS.
- `--sudo`: elevate on the target. The older `--use-remote-sudo` still parses but prints "Deprecated, use --elevate=sudo instead".
- `--rollback`: activate the previous generation on the target; combine with `switch` or `boot`.

`nixos-rebuild` is not installed on Arch (`command -v nixos-rebuild` prints nothing here). Run it as `nix run nixpkgs#nixos-rebuild -- switch --flake .#vps --target-host ...`. The first run downloads its Python closure. Verify every flag with `nix run nixpkgs#nixos-rebuild -- --help` against your lock.

### Same architecture required

The laptop builds x86_64-linux binaries. The VPS must be x86_64 too. For an aarch64 VPS you would need `--build-host` on the VPS itself, a remote builder, or emulation via `boot.binfmt.emulatedSystems`. Check with `uname -m` on the VPS before anything else.

### The manual equivalent

Knowing what the wrapper does lets you debug it:

```sh
nix build .#nixosConfigurations.vps.config.system.build.toplevel
nix copy --to ssh://dawit@203.0.113.10 ./result
ssh dawit@203.0.113.10 sudo "$(readlink ./result)/bin/switch-to-configuration" switch
```

`nix copy` sends only paths the target does not already have. `switch-to-configuration` is the activation script inside the toplevel; `nixos-rebuild` calls the same one. Note it does not register a profile generation; the wrapper does that with `nix-env --profile /nix/var/nix/profiles/system --set`. Verify: `nix copy --help` shows the `ssh://` store examples.

### Trust on the receiving end

A remote Nix daemon rejects unsigned paths from a user it does not trust. Either add your deploy user on the VPS:

```nix
{
  nix.settings.trusted-users = [ "root" "dawit" ];
}
```

or sign the laptop's store with a key and list it in the VPS's `nix.settings.trusted-public-keys`. The first is simpler; it is also equivalent to root for that user, which is already true of anyone in `wheel`. Verify: `nix.settings.trusted-users` and `trusted-public-keys` are the `nix.conf` setting names exposed as NixOS options.

### Rollback

```sh
nixos-rebuild switch --rollback --flake .#vps --target-host dawit@203.0.113.10 --sudo
```

Or over SSH, pick the generation: `sudo nixos-rebuild list-generations` then `sudo nix-env --profile /nix/var/nix/profiles/system --switch-generation 42` and `sudo /nix/var/nix/profiles/system/bin/switch-to-configuration switch`. Keep SSH access working in every generation; `test` before `switch` for anything touching sshd, firewall or users, same as [Anatomy of configuration.nix](/learn/configuration-nix).

## Try it

1. Confirm the tools evaluate from your lock, no download:

```sh
nix eval --raw nixpkgs#nixos-anywhere.version; echo; nix eval --raw nixpkgs#disko.version; echo; nix eval --raw nixpkgs#nixos-rebuild.pname
```

```text
1.13.0
1.13.0
nixos-rebuild-ng
```

2. Confirm Arch has no `nixos-rebuild`:

```sh
command -v nixos-rebuild; echo "exit $?"
```

```text
exit 1
```

3. Instantiate the VPS system from the Try-it flake without building it. This writes `.drv` files to your store and nothing else:

```sh
nix eval --raw .#nixosConfigurations.vps.config.system.build.toplevel.drvPath
```

```text
/nix/store/pbx5w7vj3wzj1r9rkbrhxb69k9f1yg8i-nixos-system-vps-26.11pre1082290.b6c8664de9b6.drv
```

Your hash differs. That `.drv` is exactly what `nixos-rebuild` would build and copy.

## Exercise

Write the full command sequence for a first deploy and the sequence for a routine change, as a fish function each, with the VPS address as an argument.

<details>
<summary>Solution</summary>

```sh
function vps-install --argument-names host
    nix run nixpkgs#nixos-anywhere -- --flake .#vps root@$host
end

function vps-deploy --argument-names host
    nix flake check --no-build
    nix run nixpkgs#nixos-rebuild -- test --flake .#vps --target-host dawit@$host --sudo
    and nix run nixpkgs#nixos-rebuild -- switch --flake .#vps --target-host dawit@$host --sudo
end
```

`test` first so a broken sshd config does not become the boot entry; `and` only switches if the test succeeded and you still have a connection.

</details>

## Trap

`--target-host` without `--sudo` as a non-root user. The build and copy succeed, then activation fails with a permissions error on `/nix/var/nix/profiles/system`, and you are left wondering whether half of it applied. Nothing applied; activation is the last step and it is atomic. Add `--sudo`, or deploy as root with key-only login.

## Checkpoint

```quiz
[
  {"q": "What does nixos-anywhere use to replace the running OS without a reboot?", "options": ["chroot", "kexec into a NixOS installer", "Docker", "A rescue ISO you mount by hand"], "answer": 1, "why": "kexec loads the installer kernel in place of the running one; then disko partitions and nixos-install runs."},
  {"q": "With `--target-host` and no `--build-host`, where is the system built?", "options": ["On the target", "On the machine running nixos-rebuild", "On cache.nixos.org", "Nowhere; it is evaluated only"], "answer": 1, "why": "The local machine builds, then copies the closure to the target for activation."},
  {"q": "Why does `nix copy` to the VPS fail with a signature error for a normal user?", "options": ["The path is corrupt", "Remote daemons reject unsigned paths unless the user is in trusted-users", "SSH is misconfigured", "nix copy requires root locally"], "answer": 1, "why": "Add the deploy user to nix.settings.trusted-users on the target or sign the local store."}
]
```
