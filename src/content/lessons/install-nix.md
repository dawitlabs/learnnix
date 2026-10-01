---
title: Install Nix on Arch
stage: 1
order: 2
slug: install-nix
summary: Know exactly what your Nix install consists of, where its config lives, and how to remove it cleanly.
minutes: 10
---

## Why this matters

You already have Nix 2.35.2 running. This lesson is about knowing what is on your disk, so that when a tutorial says "edit nix.conf" or "the installer did X", you can check whether that applies to your machine. It often does not, because you did not use the installer most tutorials assume.

## Concept

### What you actually installed

Your Nix came from the Arch package, not from an installer script:

```sh
pacman -Qo /usr/bin/nix
```

```text
/usr/bin/nix is owned by nix 2.35.2-2
```

This matters. The Arch package and the Determinate installer lay things out differently:

| Thing | Arch `nix` package (you) | Determinate installer |
|---|---|---|
| Binary | `/usr/bin/nix` | `/nix/var/nix/profiles/default/bin/nix` |
| Daemon | `nix-daemon.service` from the package | `nix-daemon.service` written by installer |
| System profile | none (`/nix/var/nix/profiles/default` does not exist) | exists |
| Config | `/etc/nix/nix.conf` from package | `/etc/nix/nix.conf` written by installer |
| Upgrade | `pacman -Syu` | re-run the installer |
| Uninstall | `pacman -Rns nix`, then remove `/nix` | `/nix/nix-installer uninstall` (Verify: installer docs) |

If a guide tells you to add `/nix/var/nix/profiles/default/bin` to PATH, skip it. That directory does not exist on your machine.

### The daemon

Nix runs a daemon as root. Your user talks to it over a socket; the daemon does the actual builds as unprivileged `nixbld` users and writes to `/nix/store`. That is why `/nix/store` is owned by `root:nixbld` and you cannot write to it directly.

```sh
systemctl is-active nix-daemon
```

```text
active
```

### Config: two files

System config is `/etc/nix/nix.conf`. Yours is almost empty:

```text
build-users-group = nixbld
```

User config is `~/.config/nix/nix.conf`. This is where flakes were turned on:

```text
experimental-features = nix-command flakes
```

The merged result is what `nix config show` prints. `fetch-tree` appears there too because `flakes` implies it.

Verify: `cat ~/.config/nix/nix.conf`. Yours currently contains that line twice. Harmless, but delete one.

### The fish PATH

Your user profile lives at `~/.local/state/nix/profiles/profile`, symlinked from `~/.nix-profile`. Packages installed with `nix profile add` land in `~/.nix-profile/bin`. Your `config.fish` already adds it:

```text
fish_add_path $HOME/.nix-profile/bin
```

Nothing more is needed for the Arch package. The `nix` binary itself is in `/usr/bin`.

### The Determinate installer, for reference

On a machine without an Arch package (Ubuntu, macOS, WSL), the common route is:

```sh
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```

Verify: `curl -sL https://install.determinate.systems/nix | head -40`. At time of writing the script pins `nix-installer` v3.22.5. It enables flakes for you and sets up the daemon. Do not run this on your Arch machine; you would get two Nix installs fighting over `/nix`.

### Trusted users

`nix config show` reports `trusted-users = root`. You are not a trusted user. Consequence: a flake's `nixConfig.extra-substituters` (binary caches) is ignored for you unless you add `trusted-users = root dave` to `/etc/nix/nix.conf`. You will hit this when a project uses Cachix. Not needed today.

### Uninstalling

Shown as text. Do not run it now.

```text
sudo systemctl disable --now nix-daemon
sudo pacman -Rns nix
sudo rm -rf /nix
rm -rf ~/.nix-profile ~/.local/state/nix ~/.cache/nix ~/.config/nix
```

Remove the `fish_add_path` line from `config.fish` and the `nixbld` users the package created (`getent passwd | grep nixbld`).

## Try it

Confirm the layout described above matches your disk.

```sh
ls -la ~/.nix-profile
ls /nix/var/nix/profiles/
```

```text
lrwxrwxrwx 1 dave dave 44 Jun 16 14:38 /home/dave/.nix-profile -> /home/dave/.local/state/nix/profiles/profile
per-user
```

No `default` entry. That is the Arch layout.

## Exercise

A tutorial says: "If `nix` is not found after install, run `. /nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh`." Decide whether that applies to you and say why.

<details>
<summary>Solution</summary>

It does not apply. That file is created by the Determinate and official installers. Your `nix` is at `/usr/bin/nix`, installed by pacman, and `/usr/bin` is always on PATH. The only PATH entry you need is `~/.nix-profile/bin`, which `config.fish` already adds.

Verify: `command -v nix` prints `/usr/bin/nix`.

</details>

## Trap

Running the Determinate installer "to be safe" on top of the Arch package. Both want to own `/nix`, `/etc/nix/nix.conf` and `nix-daemon.service`. You get a broken daemon and two binaries. One install method per machine. Yours is pacman.

## Checkpoint

```quiz
[
  {"q": "Where is the nix binary on this machine?", "options": ["/nix/var/nix/profiles/default/bin/nix", "/usr/bin/nix", "~/.nix-profile/bin/nix", "/opt/nix/bin/nix"], "answer": 1, "why": "The Arch package installs the binary via pacman into /usr/bin."},
  {"q": "Which file enables flakes for your user?", "options": ["/etc/nix/nix.conf", "~/.config/nix/nix.conf", "~/.config/fish/config.fish", "/nix/var/nix/nix.conf"], "answer": 1, "why": "User-level settings live in ~/.config/nix/nix.conf, and that is where experimental-features is set here."},
  {"q": "Why can you not write directly into /nix/store?", "options": ["It is on a read-only filesystem", "The daemon owns it and performs all writes as root/nixbld", "It is a network mount", "Nix encrypts the store"], "answer": 1, "why": "Your user only talks to nix-daemon over a socket; the daemon is the single writer to the store."}
]
```
