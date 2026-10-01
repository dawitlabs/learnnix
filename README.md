# learnnix

A structured path to Nix mastery: 39 lessons across 6 stages, plus reference cheatsheets.
Every `nix` code block is parsed by the real Nix parser before the site builds.

## Develop

```sh
pnpm install
pnpm dev
```

## Check

```sh
pnpm verify   # content: frontmatter, headings, quiz JSON, links, nix parse
pnpm check    # svelte-check
pnpm lint     # biome
pnpm build    # prerenders every page
```

## Content

- `src/content/lessons/<slug>.md` with frontmatter `title, stage, order, slug, summary, minutes`
- `src/content/reference/<slug>.md` with frontmatter `title, order, summary`
- Lessons end with a ```quiz block holding three JSON questions.
