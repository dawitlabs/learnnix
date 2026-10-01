---
title: The Omarchy desktop, declared
stage: 6
order: 39
slug: declarative-desktop
summary: Reproduce Hyprland, Waybar, greetd, PipeWire, fonts, LUKS and btrfs as NixOS options, and know what gets harder.
minutes: 20
---

## Why this matters

Omarchy is a curated set of Arch packages and dotfiles. On NixOS the same desktop is one module you can evaluate on Arch today, boot in a VM tomorrow, and install on the laptop when the VM behaves. This lesson is the laptop's `configuration.nix` minus `hardware-configuration.nix`. Every option below was evaluated against your pinned nixpkgs.

## Concept

### The whole thing

```nix
{ pkgs, ... }:
{
  boot.loader.limine.enable = true;
  boot.loader.efi.canTouchEfiVariables = true;
  boot.initrd.luks.devices.cryptroot = {
    device = "/dev/disk/by-uuid/0000-REPLACE-ME";
    allowDiscards = true;
  };
  fileSystems."/" = {
    device = "/dev/mapper/cryptroot";
    fsType = "btrfs";
    options = [ "subvol=@" "compress=zstd" "noatime" ];
  };
  fileSystems."/home" = {
    device = "/dev/mapper/cryptroot";
    fsType = "btrfs";
    options = [ "subvol=@home" "compress=zstd" "noatime" ];
  };
  fileSystems."/boot" = {
    device = "/dev/disk/by-uuid/1111-REPLACE";
    fsType = "vfat";
  };
  networking.hostName = "laptop";
  networking.networkmanager.enable = true;
  programs.hyprland.enable = true;
  programs.hyprland.withUWSM = true;
  hardware.graphics.enable = true;
  services.pipewire = {
    enable = true;
    alsa.enable = true;
    pulse.enable = true;
  };
  services.greetd = {
    enable = true;
    settings.default_session.command = "${pkgs.tuigreet}/bin/tuigreet --time --cmd 'uwsm start hyprland-uwsm.desktop'";
  };
  fonts.packages = [ pkgs.nerd-fonts.jetbrains-mono pkgs.noto-fonts pkgs.noto-fonts-color-emoji ];
  programs.nix-ld.enable = true;
  programs.appimage = { enable = true; binfmt = true; };
  users.users.dawit = {
    isNormalUser = true;
    extraGroups = [ "wheel" "networkmanager" "video" ];
    shell = pkgs.fish;
  };
  programs.fish.enable = true;
  system.stateVersion = "25.11";
}
```

### Boot and disk

`boot.loader.limine.enable` exists; so does `systemd-boot`. Both read generations from the system profile and show them as entries. `boot.initrd.luks.devices.<name>` opens the LUKS container in the initrd; `allowDiscards` passes TRIM through for the SSD. btrfs subvolumes are plain `fileSystems` entries with the same `device` and a `subvol=` mount option. The UUIDs come from `blkid` during install; `nixos-generate-config` writes them into `hardware-configuration.nix`, which is why that file exists.

### Session

`programs.hyprland.enable` installs Hyprland 0.56.2 (your lock) and, as verified, sets `xdg.portal.extraPortals` to:

```text
["/nix/store/...-xdg-desktop-portal-hyprland-1.4.1","/nix/store/...-xdg-desktop-portal-gtk-1.15.3"]
```

Portals are what make screen sharing and file pickers work under Wayland. You did not configure them; the module did. `withUWSM` wraps the session in a systemd user session, which is what Omarchy does too.

`services.greetd` is the display manager. `tuigreet` is a TUI greeter; the rendered settings:

```text
{"default_session":{"command":"/nix/store/...-tuigreet-0.11.1/bin/tuigreet --time --cmd 'uwsm start hyprland-uwsm.desktop'","user":"greeter"},"terminal":{"vt":1}}
```

`user = "greeter"` was added by the module as a `mkDefault`. The package is top-level `pkgs.tuigreet`; the older `pkgs.greetd.tuigreet` path no longer exists in this revision.

### Audio, graphics, fonts

`services.pipewire` with `alsa` and `pulse` compatibility replaces PulseAudio. `hardware.graphics.enable` is the current name; `hardware.opengl.enable` is kept as a rename alias and still evaluates without a warning in 26.11, but new configs should use `graphics`. Add `hardware.graphics.enable32Bit = true` only for Steam.

`fonts.packages` is a list. The module appends defaults (`enableDefaultPackages`), which is why the evaluated list has eleven entries starting with yours:

```text
["nerd-fonts-jetbrains-mono-3.5.0+2.304","noto-fonts-2026.09.01","noto-fonts-color-emoji-2.051","dejavu-fonts-2.37",...]
```

### Waybar, Walker, the rest: home-manager

Waybar is per-user configuration. In your home-manager module:

```nix
{ pkgs, ... }:
{
  programs.waybar = {
    enable = true;
    systemd.enable = true;
    settings.mainBar = {
      layer = "top";
      modules-left = [ "hyprland/workspaces" ];
      modules-right = [ "pulseaudio" "battery" "clock" ];
    };
    style = ''
      * { font-family: "JetBrainsMono Nerd Font"; }
    '';
  };

  home.packages = [ pkgs.walker pkgs.mako pkgs.hyprlock pkgs.hypridle ];
}
```

Verify: `programs.waybar.settings`, `.style` and `.systemd.enable` at https://home-manager-options.extranix.com. `walker`, `mako`, `hyprlock`, `hypridle` all exist in your pinned nixpkgs. Your existing `~/.config/hypr` can stay a plain directory via `mkOutOfStoreSymlink`; see [Migrate from chezmoi](/learn/migrate-from-chezmoi).

### What is harder than Arch

Honest list.

- AUR-only software. If it is not in nixpkgs, you package it. Check `search.nixos.org` first; most of Omarchy's set is there.
- Prebuilt binaries that expect `/lib64/ld-linux-x86-64.so.2`. They fail with "No such file or directory" on NixOS because that path does not exist. `programs.nix-ld.enable` provides a shim so downloaded binaries like VS Code extensions, `mise`-installed Node, or `pnpm`-fetched native modules run. `steam-run <binary>` wraps anything in an FHS environment as a last resort. `programs.appimage` with `binfmt` makes AppImages double-clickable.
- Omarchy's own scripts assume `pacman` and `yay`. They will not run; you reimplement what you use as options or `home.packages`.
- `mise` works, with `nix-ld`, but the Nix way is a `devShell` per project. See [Dev shells, deep](/learn/dev-shells-deep). Expect to run both for a while.
- Kernel and firmware updates are tied to the nixpkgs revision in your lock, not to a daily `pacman -Syu`. Slower on Arch's scale, more predictable.

## Try it

1. Save the module as `desktop.nix`, add a `laptop` host to your Try-it flake with it, and evaluate the portals list:

```sh
nix eval --json .#nixosConfigurations.laptop.config.xdg.portal.extraPortals
```

Two store paths, hyprland and gtk portals, as above.

2. Evaluate the greeter command: `.config.services.greetd.settings.default_session.command`. It contains a `tuigreet-0.11.1` store path in your lock.

3. Check the VM runner name is `run-laptop-vm`, then follow [Test NixOS in a VM first](/learn/nixos-vm-testing) to boot it. Hyprland under QEMU works with the default graphics; it is slow but enough to see Waybar and the greeter.

## Exercise

Add Bluetooth and a swap file to the module. Evaluate `hardware.bluetooth.enable` and `swapDevices`.

<details>
<summary>Solution</summary>

```nix
{
  hardware.bluetooth.enable = true;
  services.blueman.enable = true;
  swapDevices = [
    { device = "/swap/swapfile"; size = 8192; }
  ];
}
```

`swapDevices.*.size` in MiB creates the file at activation if missing. On btrfs the swapfile needs a subvolume with copy-on-write disabled; add `fileSystems."/swap"` with `subvol=@swap` and `options = [ "noatime" ]`, and set `nodatacow` on that subvolume at creation time.

Verified by evaluation: `hardware.bluetooth.enable` and `services.blueman.enable` are `true`, and `swapDevices` is `[{"device":"/swap/swapfile","size":8192}]`.

</details>

## Trap

Copying a `hardware-configuration.nix` from the VM or another machine. The VM's generated file has virtual disks and no LUKS; the laptop's has UUIDs that exist nowhere else. A wrong `by-uuid` means the initrd waits for a device that never appears and drops to an emergency shell. Always generate it on the target hardware with `nixos-generate-config`, and read it before importing it.

## Checkpoint

```quiz
[
  {"q": "What does `programs.hyprland.enable` set that you did not write?", "options": ["A Waybar config", "xdg.portal.extraPortals with the hyprland and gtk portals", "The greetd session", "Your keybindings"], "answer": 1, "why": "Modules define related options for you; evaluation showed both portals added by hyprland.nix."},
  {"q": "A downloaded Linux binary fails on NixOS with 'No such file or directory' although the file exists. Why?", "options": ["Wrong architecture", "It expects /lib64/ld-linux-x86-64.so.2, which NixOS does not have; enable programs.nix-ld", "The file is not executable", "SELinux"], "answer": 1, "why": "The dynamic loader path is hardcoded in the ELF header; nix-ld provides a shim at that path."},
  {"q": "Which name is current for GPU driver support in nixpkgs 26.11?", "options": ["hardware.opengl.enable", "hardware.graphics.enable", "services.xserver.videoDrivers only", "hardware.gpu.enable"], "answer": 1, "why": "hardware.opengl.* options are mkRenamedOptionModule aliases to hardware.graphics.*."}
]
```
