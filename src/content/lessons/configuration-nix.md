---
title: Anatomy of configuration.nix
stage: 6
order: 33
slug: configuration-nix
summary: Read and evaluate a complete NixOS configuration on Arch, and know what each nixos-rebuild action does.
minutes: 20
---

## Why this matters

`configuration.nix` is one module passed to the same `evalModules` you already know, with the NixOS module tree imported for you. You can evaluate it on Arch today, without NixOS, and inspect the result. That is how to learn NixOS before you install it on a LUKS laptop or a VPS with no console.

## Concept

### A minimal, real configuration

```nix
{ pkgs, ... }:
{
  boot.loader.grub.enable = false;
  fileSystems."/" = { device = "/dev/disk/by-label/nixos"; fsType = "ext4"; };
  networking.hostName = "vps";
  services.openssh.enable = true;
  services.openssh.settings.PasswordAuthentication = false;
  users.users.dawit = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = [ "ssh-ed25519 AAAA... dawit@laptop" ];
  };
  environment.systemPackages = [ pkgs.git pkgs.htop ];
  system.stateVersion = "25.11";
}
```

Line by line:

- `imports` is absent here. A real install adds `imports = [ ./hardware-configuration.nix ];`. That generated file holds `fileSystems`, `boot.initrd` kernel modules and `boot.loader` for your hardware. You do not hand-write it; `nixos-generate-config` does. Here the two lines `boot.loader.grub.enable = false` and `fileSystems."/"` stand in so the config evaluates.
- `boot.loader`: on an EFI laptop it is `boot.loader.systemd-boot.enable = true;` and `boot.loader.efi.canTouchEfiVariables = true;`. Limine exists too: `boot.loader.limine.enable`. Verified in `nixos/modules/system/boot/loader/`.
- `networking.hostName` is a plain string.
- `services.openssh.enable` starts sshd and, because `services.openssh.openFirewall` defaults to true, opens port 22. `settings` is an attrset rendered to `sshd_config`.
- `users.users.<name>`: `isNormalUser` gives a home and a UID in the normal range. `wheel` membership plus the default `security.sudo` is how you get sudo.
- `environment.systemPackages` is the system-wide package list. Per-user things belong in home-manager.
- `system.stateVersion` is explained below.

### Evaluate it on Arch

```sh
nix eval --impure --json --expr '
  (import ((builtins.getFlake "nixpkgs") + "/nixos/lib/eval-config.nix") {
    system = "x86_64-linux";
    modules = [ ./vps.nix ];
  }).config.networking.firewall.allowedTCPPorts'
```

```text
[22]
```

That took about 17 seconds and downloaded nothing. `eval-config.nix` is what `nixosSystem` and `nixos-rebuild` call under the hood. Everything is lazy, so asking for one option evaluates only what it depends on.

### `system.stateVersion`

It does not pin your NixOS version. The nixpkgs input does that. `stateVersion` tells modules which release's on-disk formats you started with, so an upgrade does not silently migrate a database or change a default that would break existing state. Set it to the release you installed with. Never bump it as part of an upgrade. Leave it out and you get a warning at every eval:

```text
evaluation warning: system.stateVersion is not set, defaulting to 26.11. Read why this matters on https://nixos.org/manual/nixos/stable/options.html#opt-system.stateVersion.
```

### Build, then activate

A configuration evaluates to one derivation, `config.system.build.toplevel`. On this machine evaluating its path gives:

```text
/nix/store/pbx5w7vj3wzj1r9rkbrhxb69k9f1yg8i-nixos-system-vps-26.11pre1082290.b6c8664de9b6.drv
```

Building it produces a directory with the kernel, initrd, `/etc` contents, systemd units and an `activate` script. `nixos-rebuild` is a wrapper that builds that derivation and then runs the activation you asked for. Actions, verified in `nixos-rebuild-ng`:

| Action | Builds | Activates now | Boot entry |
|---|---|---|---|
| `build` | yes, to `./result` | no | no |
| `test` | yes | yes | no |
| `boot` | yes | no | yes |
| `switch` | yes | yes | yes |
| `dry-activate` | yes | prints what would change | no |
| `build-vm` | yes, a QEMU script | no | no |
| `list-generations` | no | no | lists entries |

Run on NixOS later, as root:

```sh
sudo nixos-rebuild test
sudo nixos-rebuild switch
```

### Generations and rollback

Each `switch` or `boot` creates a system profile generation, `/nix/var/nix/profiles/system-N-link`, and a bootloader entry. The old generations stay. If the new one does not boot, pick the previous entry in systemd-boot or Limine. If it boots but is wrong:

```sh
sudo nixos-rebuild switch --rollback
```

`--rollback` is a flag, not an action; it activates the previous generation without rebuilding. Old generations are only removed by `nix-collect-garbage -d` or `nix.gc`. Until then every rollback target exists on disk.

### Where to find option names

The NixOS manual has them, but the source is faster and always matches your pinned revision:

```sh
nix eval --raw nixpkgs#path
```

On Nix 2.35 the path printed by `nix flake metadata` can be a lazy reference that does not exist on disk; `nix eval --raw nixpkgs#path` copies it to the store and prints the real location. Then `grep -rn "PasswordAuthentication" <path>/nixos/modules/services/networking/ssh/sshd.nix`.

## Try it

1. Save the configuration as `vps.nix` and evaluate the rendered sshd settings:

```sh
nix eval --impure --json --expr '(import ((builtins.getFlake "nixpkgs") + "/nixos/lib/eval-config.nix") { system = "x86_64-linux"; modules = [ ./vps.nix ]; }).config.services.openssh.settings.PasswordAuthentication'
```

```text
false
```

2. Remove the `system.stateVersion` line and evaluate `.config.system.stateVersion`. You get the warning above and `"26.11"`.

3. Check the user's groups: `.config.users.users.dawit.extraGroups` gives `["wheel"]`.

## Exercise

Add `time.timeZone = "Africa/Addis_Ababa";` and `networking.firewall.allowedTCPPorts = [ 80 443 ];` to `vps.nix`. Evaluate `allowedTCPPorts` and explain where the third value comes from.

<details>
<summary>Solution</summary>

```nix
{ pkgs, ... }:
{
  boot.loader.grub.enable = false;
  fileSystems."/" = { device = "/dev/disk/by-label/nixos"; fsType = "ext4"; };
  networking.hostName = "vps";
  time.timeZone = "Africa/Addis_Ababa";
  networking.firewall.allowedTCPPorts = [ 80 443 ];
  services.openssh.enable = true;
  services.openssh.settings.PasswordAuthentication = false;
  users.users.dawit = {
    isNormalUser = true;
    extraGroups = [ "wheel" ];
    openssh.authorizedKeys.keys = [ "ssh-ed25519 AAAA... dawit@laptop" ];
  };
  environment.systemPackages = [ pkgs.git pkgs.htop ];
  system.stateVersion = "25.11";
}
```

```text
[22,80,443]
```

Port 22 is contributed by the openssh module (`openFirewall` default). `allowedTCPPorts` is a `listOf port`, so the two definitions concatenate. The order is the module system's merge order, not numeric and not the order in your file; never rely on it.

</details>

## Trap

Running `nixos-rebuild switch` as the first test of a change to networking, sshd or the display manager. If the change is wrong you lose the connection or the screen, and the config is also the next boot entry. Use `test` first: same activation, no boot entry, so a power cycle brings back the last known good generation. Only `switch` once `test` behaved.

## Checkpoint

```quiz
[
  {"q": "What does `system.stateVersion` control?", "options": ["Which nixpkgs revision is used", "Compatibility defaults for on-disk state from the release you installed with", "The kernel version", "How many generations are kept"], "answer": 1, "why": "Package versions come from the nixpkgs input; stateVersion only freezes state-related defaults."},
  {"q": "Which action activates the new config without adding a boot entry?", "options": ["switch", "boot", "test", "build"], "answer": 2, "why": "test activates immediately but leaves the bootloader alone, so a reboot returns to the previous generation."},
  {"q": "Why does `networking.firewall.allowedTCPPorts` contain 22 when you never set it?", "options": ["22 is always open on NixOS", "services.openssh.openFirewall defaults to true and the list type concatenates", "The firewall is disabled", "hardware-configuration.nix adds it"], "answer": 1, "why": "Modules contribute to list options; sshd's module adds its ports when openFirewall is true."}
]
```
