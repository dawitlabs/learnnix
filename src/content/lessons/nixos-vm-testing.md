---
title: Test NixOS in a VM first
stage: 6
order: 35
slug: nixos-vm-testing
summary: Build any nixosConfiguration as a QEMU VM, size it, forward ports, and know what the VM does not test.
minutes: 15
---

## Why this matters

Your laptop boots from LUKS on btrfs via Limine. The first NixOS config you write for it will be wrong somewhere. A VM lets you boot the exact configuration, log in, and check services and the desktop session for the cost of a build, with no risk to the Arch install. For the VPS, the VM is the only staging environment you have.

## Concept

### Every configuration already has a VM

The NixOS module tree includes `virtualisation/build-vm.nix`. It defines `system.build.vm` for every configuration, a script that boots the same `toplevel` under QEMU with a throwaway disk image. Verified in `nixos/modules/virtualisation/qemu-vm.nix`:

```text
system.build.vm =
  hostPkgs.runCommand "nixos-vm"
    {
      preferLocalBuild = true;
      meta.mainProgram = "run-${config.system.name}-vm";
    }
```

`system.name` defaults to the hostname, so a host named `laptop` gives `result/bin/run-laptop-vm`. Verified by evaluating `config.system.build.vm.meta.mainProgram`:

```text
"run-laptop-vm"
```

Two ways to build it. From the flake directory, on any machine with Nix:

```sh
nix build .#nixosConfigurations.laptop.config.system.build.vm
./result/bin/run-laptop-vm
```

Or, on a NixOS machine:

```sh
nixos-rebuild build-vm --flake .#laptop
```

Both produce the same script. Running it starts QEMU with a window; the first start creates `laptop.qcow2` in the current directory for persistent state. Delete that file for a clean slate. Building the VM builds the whole system closure, so on a 700 KB/s line expect the first run to fetch a few hundred MB of binaries from the cache.

### `vmVariant`: VM-only settings

`virtualisation.*` options come from the QEMU module, which is not imported into the real system. Set them directly in `configuration.nix` and the real build fails with "option does not exist". The hook is `virtualisation.vmVariant`, a nested module applied only to the VM build:

```nix
{
  virtualisation.vmVariant = {
    virtualisation = {
      memorySize = 2048;
      cores = 2;
      forwardPorts = [
        { from = "host"; host.port = 2222; guest.port = 22; }
      ];
    };
  };
}
```

Verified output of `.config.virtualisation.vmVariant.virtualisation.forwardPorts`:

```text
[{"from":"host","guest":{"address":"","port":22},"host":{"address":"","port":2222},"proto":"tcp"}]
```

`memorySize` is in MiB and defaults to `1024`, verified. With the laptop's 15 GB, 2048 to 4096 is comfortable. `forwardPorts` is QEMU user networking: `ssh -p 2222 dawit@localhost` reaches the VM's sshd. Without it the VM can reach the internet but nothing reaches the VM.

Users in the VM have no password unless you set one. For testing add a `vmVariant`-only `users.users.dawit.initialPassword = "test";`. Never put that outside `vmVariant`.

### What the VM does not test

The QEMU module overrides disk-related options with `mkVMOverride`, which is `mkOverride 10`, below even `mkForce` at 50. So in the VM:

- `fileSystems` are replaced by the VM's own virtual disk. Your btrfs subvolumes and `/boot` are not exercised.
- `boot.initrd.luks.devices` is irrelevant; nothing is encrypted.
- The bootloader is skipped. The VM boots the kernel directly. `nixos-rebuild build-vm-with-bootloader` exists and does install one; it is slower and still not your firmware.
- GPU is emulated. Hyprland starts, but performance and the real Intel driver path are untested.

What it does test: every service, user, package, systemd unit, the display manager, portals, fonts, your home-manager config, and whether the configuration evaluates and builds at all. That is most of the risk.

### A VM-first workflow

1. Write the host config. Evaluate options on Arch with `nix eval` as in [Flake-based NixOS](/learn/flake-based-nixos).
2. Build the VM. Boot it. Log in. `systemctl --failed`.
3. Fix, rebuild. The qcow2 persists, so stateful bugs are reproducible.
4. Only then: install on hardware, and test `boot.initrd.luks` and `fileSystems` from the installer with a `nixos-install` that you can retry.

## Try it

1. Confirm the VM attribute exists for the Try-it flake from the previous lesson, without building:

```sh
nix eval --raw .#nixosConfigurations.vps.config.system.build.vm.meta.mainProgram
```

```text
run-vps-vm
```

2. Read the default VM memory from your own config:

```sh
nix eval --json .#nixosConfigurations.vps.config.virtualisation.vmVariant.virtualisation.memorySize
```

```text
1024
```

3. Find the `forwardPorts` example in the source:

```sh
grep -n "forward local port 2222" "$(nix eval --raw nixpkgs#path)/nixos/modules/virtualisation/qemu-vm.nix"
```

Prints one matching line with its number. The number changes between revisions.

## Exercise

Add a `vmVariant` to `vps.nix` that gives the VM 2 GiB, forwards host 2222 to guest 22, and sets a test password for `dawit`. Evaluate `forwardPorts` and confirm `initialPassword` is unset in the non-VM config.

<details>
<summary>Solution</summary>

```nix
{
  virtualisation.vmVariant = {
    virtualisation.memorySize = 2048;
    virtualisation.forwardPorts = [
      { from = "host"; host.port = 2222; guest.port = 22; }
    ];
    users.users.dawit.initialPassword = "test";
  };
}
```

Add the file to the module list. Then:

```sh
nix eval --json .#nixosConfigurations.vps.config.virtualisation.vmVariant.users.users.dawit.initialPassword
nix eval --json .#nixosConfigurations.vps.config.users.users.dawit.initialPassword
```

The first prints `"test"`, the second `null`. The password exists only inside the VM variant.

</details>

## Trap

Believing a booting VM means the laptop will boot. The VM never touched your `fileSystems`, LUKS or Limine, because `mkVMOverride` replaced them at priority 10. A typo in a `by-uuid` path or a missing `boot.initrd.availableKernelModules` for your NVMe controller only shows up on hardware. Treat the VM as proof for services and desktop, and keep a live USB for the first real boot.

## Checkpoint

```quiz
[
  {"q": "Where do `virtualisation.memorySize` and friends belong in a real host config?", "options": ["At top level in configuration.nix", "Inside virtualisation.vmVariant", "In hardware-configuration.nix", "In flake.nix"], "answer": 1, "why": "The QEMU module is only imported for the VM build; vmVariant scopes those options to it."},
  {"q": "What is the attribute path of the VM runner for host `laptop` in a flake?", "options": ["nixosConfigurations.laptop.vm", "nixosConfigurations.laptop.config.system.build.vm", "packages.x86_64-linux.laptop-vm", "nixosConfigurations.laptop.config.virtualisation.vm"], "answer": 1, "why": "system.build.vm is defined by build-vm.nix for every NixOS configuration."},
  {"q": "Which of these is NOT tested by booting the VM?", "options": ["systemd services", "The LUKS and btrfs layout", "home-manager activation", "Font configuration"], "answer": 1, "why": "The VM uses its own disk image; fileSystems and luks options are overridden with mkVMOverride."}
]
```
