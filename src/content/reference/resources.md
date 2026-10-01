---
title: Resources
order: 7
summary: The handful of Nix sources worth your time, one honest sentence each, and the ones to skip.
---

Not fetched or checked for uptime while writing this page; these are the canonical locations as of nixpkgs 26.11.

## Learn

**nix.dev**
https://nix.dev. The official tutorials; start with "Nix language basics" and "Module system deep dive". Unreachable from some networks; `curl https://r.jina.ai/https://nix.dev/` returns a text rendering, or `git clone https://github.com/NixOS/nix.dev` and read the Markdown source.

**Zero to Nix**
https://zero-to-nix.com. Determinate Systems' flake-first quickstart. Fast, modern, stops early; good for the first two hours.

**Nix Pills**
https://nixos.org/guides/nix-pills/. Builds `mkDerivation` from scratch over twenty chapters. Old CLI, still the best explanation of what stdenv actually does.

**NixOS & Flakes Book**
https://nixos-and-flakes.thiscute.world. Community book covering a full flake-based NixOS plus home-manager setup, in the order you would actually do it. Opinionated and current.

## Reference

**Nix reference manual**
https://nix.dev/manual/nix. The CLI, the language, `nix.conf`, the store. Pick the version matching `nix --version`.

**nixpkgs manual**
https://nixos.org/manual/nixpkgs/unstable/. Builders, language frameworks, overlays, `stdenv` phases. The chapter on your language's builder is required reading before packaging.

**NixOS manual**
https://nixos.org/manual/nixos/unstable/. Installation, `nixos-rebuild`, and the full option list as an appendix.

**noogle.dev**
https://noogle.dev. Search `lib` and `builtins` by name or by type signature. The fastest way to find `lib.mapAttrsToList` when you only remember what it does.

**search.nixos.org**
https://search.nixos.org. Packages and NixOS options, by channel. Shows the option's type, default, and the source file.

**home-manager option search**
https://home-manager-options.extranix.com. Same for home-manager, with release and master toggles. Verify every `programs.*` name here.

**wiki.nixos.org**
https://wiki.nixos.org. The official wiki since 2024. Hardware pages and "how do I X on NixOS" recipes. Not `nixos.wiki`, see below.

**nixpkgs source**
https://github.com/NixOS/nixpkgs. When docs disagree with behaviour, the module file wins. Locally: `nix eval --raw nixpkgs#path`, then grep.

## Follow

**Determinate Systems blog**
https://determinate.systems/blog. Flakes, the installer, and Nix internals explained by people who work on them. Vendor, but accurate.

**Discourse**
https://discourse.nixos.org. Announcements, RFC discussions, and the place to ask when the error message is not on the web.

**Matrix**
`#nix:nixos.org` and `#nixos:nixos.org`. Live help; the search is poor, so ask, do not browse.

## Skip

- Paid Nix books and courses. Everything above is free and more current.
- `nixos.wiki`. The old unofficial wiki; frozen and partially wrong. Use `wiki.nixos.org`.
- Blog posts from before 2022 about the CLI. `nix-env -i`, channels, `nix-shell -p` without flakes; the concepts hold, the commands do not.
- Anything recommending `nix-env -iA` for daily package installs. Use a dev shell, `home.packages`, or `environment.systemPackages`.
