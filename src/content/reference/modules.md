---
title: Module system reference
order: 4
summary: mkOption fields, types, merge priorities and the option roots you will reach for most, verified against nixpkgs 26.11.
---

Verified against nixpkgs `26.11.20260929.b6c8664` (`lib/options.nix`, `lib/types.nix`, `lib/modules.nix`). Lesson: [The module system](/learn/module-system).

## `mkOption` fields

| Field | Meaning |
|---|---|
| `type` | A `lib.types.*` value. Controls checking and merging. Omit only for untyped legacy options. |
| `default` | Value when nothing defines the option. Sits at priority 1500. No default means required. |
| `defaultText` | Literal string shown in docs instead of rendering `default`. Use when the default references `pkgs` or `config`. |
| `example` | Shown in docs. Wrap in `lib.literalExpression` for code. |
| `description` | Markdown sentence rendered to the manual and option search. End with a period. |
| `apply` | Function applied to the merged value before `config.<opt>` sees it. |
| `relatedPackages` | List of package attr paths to link from the docs. |
| `internal` | Hide from generated docs. |
| `visible` | `false` hides from docs; `"shallow"` hides children of submodules. |
| `readOnly` | Any user definition is an error; module-set value only. |

Shorthands: `mkEnableOption "x"` is a `bool` defaulting to `false` with description `Whether to enable x.`. `mkPackageOption pkgs "name" {}` is a `package` option defaulting to `pkgs.name`.

## Types

All in `lib.types`. The `description` column is what evaluation prints in error messages.

| Type | Description string | Meaning and merge |
|---|---|---|
| `bool` | `boolean` | One definition, or conflict. |
| `str` | `string` | One definition, or conflict. |
| `int` | `signed integer` | One definition, or conflict. |
| `port` | `16 bit unsigned integer; between 0 and 65535` | An `int` restricted to port range. |
| `path` | `absolute path` | A path or string starting with `/`. Store paths included. |
| `package` | `package` | A derivation, or a string that is coerced via `pkgs`. |
| `lines` | `strings concatenated with "\n"` | Multiple definitions are joined with newlines. Use for config file bodies. |
| `listOf t` | `list of <t>` | Definitions concatenate. Order via `mkBefore`/`mkAfter`/`mkOrder`. |
| `attrsOf t` | `attribute set of <t>` | Union of keys; each value merged by `t`. Strict in keys. `lazyAttrsOf` is the lazy variant for recursive definitions. |
| `nullOr t` | `null or <t>` | `null` or a `t`. Multiple non-null definitions conflict. |
| `enum [ a b ]` | `one of "a", "b"` | One of the listed values. |
| `submodule { options = ...; }` | `submodule` | A module used as a type. Fields merge by their own types. Use with `attrsOf` or `listOf` for records. |
| `either a b` | `<a> or <b>` | Accepts either type; merge rules of whichever matched. |
| `oneOf [ a b c ]` | `<a> or <b> or <c>` | `either` over a list. |
| `anything` | `anything` | Accepts any value; merges attrsets recursively, otherwise one definition. |
| `raw` | `raw value` | Accepts anything, no merging at all. One definition. |
| `strMatching re` | `string matching the pattern <re>` | A `str` constrained by a regex. |
| `nonEmptyStr` | `non-empty string` | A `str` that is not empty. |
| `functionTo t` | `function that evaluates to a(n) <t>` | A function whose result is checked as `t`. |
| `separatedString sep` | `strings concatenated with <sep>` | `lines` is `separatedString "\n"`; `commas` is `separatedString ","`. |
| `attrTag { a = mkOption ...; }` | `attribute-tagged union with choices: a` | Exactly one of the listed attribute names must be set. |
| `ints.between 1 5` | `integer between 1 and 5 (both inclusive)` | `ints.unsigned` is `>=0`, `ints.positive` is `>0`. |

Verify: `nix eval --impure --raw --expr 'let lib = (import (builtins.getFlake "nixpkgs") {}).lib; in (lib.types.listOf lib.types.str).description'` prints `list of string`.

## Priorities

Lower number wins. Verified in `lib/modules.nix`.

| Helper | Priority | Use |
|---|---|---|
| `mkOptionDefault` | 1500 | What `default` in `mkOption` uses. |
| `mkDefault` | 1000 | A module's opinion a user may change. |
| plain definition | 100 | `defaultOverridePriority`. What you write in `configuration.nix`. |
| `mkImageMediaOverride` | 60 | Installer ISO settings that beat user config. |
| `mkForce` | 50 | Beat a plain definition. |
| `mkVMOverride` | 10 | QEMU VM settings; beats `mkForce`. |
| `mkOverride n` | n | Pick your own. |

Equal priority, scalar type: conflict error. Equal priority, list or attrs type: merged.

Order within merged lists (`lib/modules.nix`):

| Helper | Order |
|---|---|
| `mkBefore` | 500 |
| plain | 1000 (`defaultOrderPriority`) |
| `mkAfter` | 1500 |
| `mkOrder n` | n |

Verified: `pkgs = [ "git" "fish" ]` plus `mkAfter [ "zzz" ]` plus `mkBefore [ "aaa" ]` gives `["aaa","git","fish","zzz"]`.

Conditionals and grouping: `mkIf cond value`, `mkMerge [ a b ]`, `optionalAttrs` (plain Nix, not module-aware; prefer `mkIf`).

Inspection: `(evalModules {...}).options.<opt>.highestPrio`, `.files`, `.definitionsWithLocations`, `.type.description`.

## Common NixOS option roots

Verified by grep in `nixos/modules/`.

| Root | What lives there |
|---|---|
| `boot.loader.systemd-boot`, `boot.loader.limine`, `boot.loader.grub`, `boot.loader.efi.canTouchEfiVariables` | Bootloader. |
| `boot.initrd.luks.devices.<name>` | LUKS containers opened in initrd. |
| `fileSystems."<mount>"` | `device`, `fsType`, `options`, `neededForBoot`. |
| `swapDevices` | List of `{ device; size; }`. |
| `networking.hostName`, `networking.networkmanager`, `networking.firewall.allowedTCPPorts` | Network. |
| `users.users.<name>` | `isNormalUser`, `extraGroups`, `shell`, `hashedPassword`, `openssh.authorizedKeys.keys`. |
| `environment.systemPackages`, `environment.variables` | System-wide packages and env. |
| `programs.<name>.enable` | Programs needing system integration: `fish`, `hyprland`, `nix-ld`, `appimage`. |
| `services.<name>` | Daemons: `openssh`, `pipewire`, `greetd`, `networkmanager`. |
| `systemd.services.<name>`, `systemd.timers.<name>` | Your own units. `serviceConfig`, `wantedBy`, `after`, `environment`, `path`, `script`. |
| `hardware.graphics`, `hardware.bluetooth` | Drivers. `hardware.opengl.*` are rename aliases. |
| `fonts.packages`, `fonts.fontconfig.defaultFonts` | Fonts. |
| `xdg.portal` | Desktop portals. |
| `nix.settings` | `nix.conf` keys: `experimental-features`, `trusted-users`, `substituters`. |
| `virtualisation.vmVariant` | VM-only overrides for `build-vm`. |
| `system.stateVersion` | Set once at install, never bump. |

## Common home-manager option roots

Not verifiable offline here. Verify each at https://home-manager-options.extranix.com.

| Root | What lives there |
|---|---|
| `home.username`, `home.homeDirectory`, `home.stateVersion` | Required basics. |
| `home.packages` | Per-user packages. |
| `home.file."<path>"`, `xdg.configFile."<path>"` | Files in `~` and `~/.config`. `source`, `text`, `recursive`. |
| `home.sessionVariables`, `home.sessionPath` | Env for login sessions. |
| `programs.fish`, `programs.neovim`, `programs.git`, `programs.waybar` | Per-program modules. |
| `services.<name>` | User systemd services such as `mako`, `hypridle`. |
| `config.lib.file.mkOutOfStoreSymlink` | Function, not an option: symlink to a path outside the store. |
