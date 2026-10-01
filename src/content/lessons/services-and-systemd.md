---
title: Services and systemd units
stage: 6
order: 36
slug: services-and-systemd
summary: Turn your systemd --user Python bot into a hardened NixOS system service with a timer, verified by evaluation.
minutes: 20
---

## Why this matters

On the VPS the Telegram bot is a hand-written `~/.config/systemd/user/*.service`, a venv, and a `.env` you scp'd. NixOS makes the unit, the interpreter and its dependencies one declaration. `systemd.services.<name>` is the single most-used NixOS option after `services.*.enable`, and you can see the exact unit file it generates on Arch today.

## Concept

### `services.*` versus `systemd.services.*`

`services.openssh.enable = true` is a nixpkgs module that itself defines `systemd.services.sshd`. When nixpkgs has a module for your software, use it. For your own program there is no module, so you write the unit directly.

### A packaged interpreter, not a venv

```nix
{ pkgs, ... }:
let
  python = pkgs.python3.withPackages (ps: [ ps.python-telegram-bot ]);
in
{
  systemd.services.claimbot = {
    description = "Telegram claim bot";
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    wantedBy = [ "multi-user.target" ];
    environment.PYTHONUNBUFFERED = "1";
    serviceConfig = {
      ExecStart = "${python}/bin/python /var/lib/claimbot/bot.py";
      DynamicUser = true;
      StateDirectory = "claimbot";
      EnvironmentFile = "/run/secrets/claimbot.env";
      Restart = "on-failure";
      RestartSec = 5;
      NoNewPrivileges = true;
      ProtectSystem = "strict";
      ProtectHome = true;
      PrivateTmp = true;
    };
  };
}
```

What each NixOS-level attribute is, verified in `nixos/lib/systemd-unit-options.nix`:

- `description`, `after`, `wants`, `wantedBy` map to the `[Unit]` and `[Install]` sections. `wantedBy = [ "multi-user.target" ]` is what "enabled" means; without it the unit exists but never starts at boot.
- `environment` is an attrset of variables for `[Service] Environment=`.
- `serviceConfig` is passed through to `[Service]` as-is. The keys are systemd's own, so `man systemd.service` and `man systemd.exec` are the reference, not NixOS docs.
- `path` (not used here) prepends packages to the unit's `PATH`. `script` lets you write the body inline instead of `ExecStart`.

`pkgs.python3.withPackages` builds one interpreter with the libraries on its path. `${python}` interpolates its store path, so `ExecStart` points at a fixed, pinned Python. Verified `serviceConfig` output:

```text
{"DynamicUser":true,"EnvironmentFile":"/run/secrets/claimbot.env","ExecStart":"/nix/store/2lryjhqwxj7raghq9n7ibynb3saw9pi7-python3-3.14.7-env/bin/python /var/lib/claimbot/bot.py","NoNewPrivileges":true,"PrivateTmp":true,"ProtectHome":true,"ProtectSystem":"strict","Restart":"on-failure","RestartSec":5,"StateDirectory":"claimbot"}
```

The script itself can live in the store too: `ExecStart = "${python}/bin/python ${./bot.py}";` copies `bot.py` from the repo into the store at build time. Then there is nothing to deploy by hand. Secrets stay out; see [Secrets management](/learn/secrets-management).

### `DynamicUser` and `StateDirectory`

`DynamicUser = true` makes systemd allocate a throwaway UID at start. No `users.users.claimbot`, no stale home directory, and the process cannot own files outside what you grant. `StateDirectory = "claimbot"` creates `/var/lib/claimbot` owned by that dynamic user and keeps it across restarts. Together they replace "create a user, mkdir, chown" from a Debian README.

### Hardening is just more `serviceConfig`

`NoNewPrivileges`, `ProtectSystem = "strict"`, `ProtectHome`, `PrivateTmp` are systemd directives. NixOS passes them through unchanged. Start with these four; `systemd-analyze security claimbot` on the host scores the rest. `ProtectSystem = "strict"` makes the whole filesystem read-only except paths you grant, which is why `StateDirectory` matters.

### An alternative: `writeShellApplication`

For a bot that is one script plus env, wrapping is simpler than packaging:

```nix
{ pkgs, ... }:
let
  python = pkgs.python3.withPackages (ps: [ ps.python-telegram-bot ]);
  claimbot = pkgs.writeShellApplication {
    name = "claimbot";
    runtimeInputs = [ python ];
    text = ''
      exec python ${./bot.py}
    '';
  };
in
{
  systemd.services.claimbot = {
    wantedBy = [ "multi-user.target" ];
    serviceConfig.ExecStart = "${claimbot}/bin/claimbot";
    serviceConfig.DynamicUser = true;
  };
}
```

`writeShellApplication` runs shellcheck at build time and sets `PATH` from `runtimeInputs`, so `python` resolves without a store path in the script.

### Timers

```nix
{ pkgs, ... }:
{
  systemd.services.backup-db = {
    serviceConfig.Type = "oneshot";
    script = "${pkgs.sqlite}/bin/sqlite3 /var/lib/app/app.db '.backup /var/backups/app.db'";
  };
  systemd.timers.backup-db = {
    wantedBy = [ "timers.target" ];
    timerConfig = {
      OnCalendar = "daily";
      Persistent = true;
    };
  };
}
```

A timer activates the service with the same name. `Persistent = true` runs a missed job at next boot. Verified generated unit:

```text
[Unit]

[Timer]
OnCalendar=daily
Persistent=true


[Install]
WantedBy=timers.target
```

### From `systemd --user` to this

Your user unit's `ExecStart=/home/x/bot/.venv/bin/python bot.py` becomes `${python}/bin/python` plus the packaged libraries. `WorkingDirectory=` becomes `StateDirectory`. The `.env` becomes `EnvironmentFile` pointing at a secret path provided at runtime. `systemctl --user enable` becomes `wantedBy`. Logs stay in `journalctl -u claimbot`.

## Try it

1. Save the first module as `bot.nix`, add it to the Try-it flake's module list, and render the unit file:

```sh
nix eval --raw .#nixosConfigurations.vps.config.systemd.units.\"claimbot.service\".text
```

```text
[Unit]
After=network-online.target
Description=Telegram claim bot
Wants=network-online.target

[Service]
Environment="LOCALE_ARCHIVE=/nix/store/1m9dlscbzj1ma5xjsbfw2kk0gwfq3qb7-glibc-locales-2.44-25/lib/locale/locale-archive"
Environment="PATH=/nix/store/2gfxiwls9hbgwdwcy43mprchwsq36mg6-coreutils-9.11/bin:/nix/store/ycrbcy9sg4knpnik6a01dk70l0m673x7-findutils-4.11.0/bin:/nix/store/3668q0d9zhc5n9l2pnyvpd44kz9bjsjm-gnugrep-3.12/bin:/nix/store/1ggxndc1gd5061j5hqprhnhx9p30yilv-gnused-4.10/bin:/nix/store/l5hiab3932k2n4d6nirh09mk6xgxp61w-systemd-261.3/bin:/nix/store/2gfxiwls9hbgwdwcy43mprchwsq36mg6-coreutils-9.11/sbin:/nix/store/ycrbcy9sg4knpnik6a01dk70l0m673x7-findutils-4.11.0/sbin:/nix/store/3668q0d9zhc5n9l2pnyvpd44kz9bjsjm-gnugrep-3.12/sbin:/nix/store/1ggxndc1gd5061j5hqprhnhx9p30yilv-gnused-4.10/sbin:/nix/store/l5hiab3932k2n4d6nirh09mk6xgxp61w-systemd-261.3/sbin"
Environment="PYTHONUNBUFFERED=1"
Environment="TZDIR=/nix/store/n8fqcpnr5ni28l3i9svqa70wz46798v9-tzdata-2026d/share/zoneinfo"
DynamicUser=true
EnvironmentFile=/run/secrets/claimbot.env
ExecStart=/nix/store/2lryjhqwxj7raghq9n7ibynb3saw9pi7-python3-3.14.7-env/bin/python /var/lib/claimbot/bot.py
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
Restart=on-failure
RestartSec=5
StateDirectory=claimbot

[Install]
WantedBy=multi-user.target
```

Hashes differ with your lock. Note the `PATH` NixOS injects: coreutils, findutils, grep, sed, systemd. Nothing else, unless you add it to `path`.

2. Evaluate the timer: `.config.systemd.timers.backup-db.timerConfig` gives `{"OnCalendar":"daily","Persistent":true}`.

## Exercise

Convert this user unit into a NixOS service with `DynamicUser` and a `StateDirectory`:

```text
[Service]
WorkingDirectory=/home/dawit/bot
ExecStart=/home/dawit/bot/.venv/bin/python main.py
EnvironmentFile=/home/dawit/bot/.env
Restart=always
```

<details>
<summary>Solution</summary>

```nix
{ pkgs, ... }:
let
  python = pkgs.python3.withPackages (ps: [ ps.python-telegram-bot ]);
in
{
  systemd.services.bot = {
    wantedBy = [ "multi-user.target" ];
    after = [ "network-online.target" ];
    wants = [ "network-online.target" ];
    serviceConfig = {
      ExecStart = "${python}/bin/python ${./main.py}";
      WorkingDirectory = "/var/lib/bot";
      StateDirectory = "bot";
      DynamicUser = true;
      EnvironmentFile = "/run/secrets/bot.env";
      Restart = "always";
    };
  };
}
```

The script moves into the store, state moves to `/var/lib/bot`, the `.env` becomes a runtime secret path. `Restart = "always"` is kept, though `on-failure` is usually what you meant.

</details>

## Trap

`ExecStart = "python bot.py"`. Units have the minimal `PATH` shown above; `python` is not on it and the service fails with exit code 203. Always interpolate a store path, or add the package to `path = [ python ];` so systemd finds it. The same applies to `curl`, `git`, anything.

## Checkpoint

```quiz
[
  {"q": "What does `wantedBy = [ \"multi-user.target\" ]` correspond to?", "options": ["systemctl start", "systemctl enable", "Restart=always", "After=network.target"], "answer": 1, "why": "It writes the [Install] WantedBy line, which is what enabling a unit creates."},
  {"q": "Why is `serviceConfig` documented in man systemd.exec rather than the NixOS manual?", "options": ["NixOS has no docs", "Its keys are passed through verbatim as [Service] directives", "It is deprecated", "It only accepts ExecStart"], "answer": 1, "why": "NixOS renders the attrset into the unit file unchanged; the keys are systemd's."},
  {"q": "A service with ExecStart=\"python bot.py\" fails with status 203. Why?", "options": ["Python is not installed", "The unit PATH only has coreutils and a few tools; interpolate ${python}/bin/python", "DynamicUser blocks it", "bot.py is read-only"], "answer": 1, "why": "Exit 203 is EXEC failure; the binary was not found on the unit's minimal PATH."}
]
```
