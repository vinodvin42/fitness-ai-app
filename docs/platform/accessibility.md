# Accessibility

WCAG 2.1 AA is in this project's definition of done. It had never been
measured until 29 Sep 2026. This page records what is checked, how, and
what is still not covered.

## What runs

| Check | Covers | Where |
|---|---|---|
| `apps/api/tests/designTokenContrast.test.ts` | All five palettes: both React Native token files, the marketing site's CSS variables, and the three consoles' Tailwind themes | The API suite, so it runs in CI |
| `scripts/a11y-audit.mjs` | axe-core, WCAG 2.1 A/AA, over 24 marketing pages at two widths and 37 console routes behind a real login | By hand — see below |

The palette test is in the API's suite because that is the only workspace
with a test runner (`docs/mobile/i18n.md` has the npm bug that blocks
installing one in `user-mobile`). Reading five files from a sixth
workspace is not elegant; a palette nobody checks is worse.

The audit script is not a repo dependency. axe-core and playwright
together are large, and `npm install` in this workspace has its own
history of breaking. An audit tool that makes the install fragile is an
audit tool nobody runs.

```bash
npm i --no-save axe-core playwright
node scripts/a11y-audit.mjs                # marketing site
node scripts/a11y-audit.mjs --apps         # + consoles
```

`--apps` needs the API and the three dev servers running, and
`A11Y_PASSWORD` plus `A11Y_{ADMIN,GYM,CREATOR}_EMAIL` for accounts that
can actually log in. If a login fails the report says so loudly, because
otherwise a 23-route audit quietly becomes a one-route audit that reports
"NO VIOLATIONS".

## What the first audit found

**Every palette in the repo failed on exactly one token — the dim/muted
one.** All five were eyeballed; none had ever been measured.

| Palette | Token | Was | Now | Worst case |
|---|---|---|---|---|
| user-mobile | `textMuted` | `#5E6675` (2.55:1) | `#8B919C` | 4.65:1 |
| user-mobile | `pink` | `#EC4899` (4.17:1) | `#EE59A3` | 4.62:1 |
| coach-mobile | `textMuted` | `#65656F` (2.84:1) | `#88888F` | 4.65:1 |
| coach-mobile | `danger` | `#EF4444` (4.35:1) | `#F04E4E` | 4.60:1 |
| landing | `--text-muted` | `#5e6675` (2.88:1) | `#8b919c` | 4.65:1 |
| admin-web, gym-portal, creator-portal | `--color-text-dim` | `#5b6472` (2.89:1) | `#7d8590` | 4.64:1 |

That token carries exactly the text a low-vision reader most needs:
footer headings, timestamps, "not built yet" notes, field hints, table
column headers, the "—" standing in for an empty field. axe-core alone
found 189 instances on the marketing site.

Three structural findings, all in admin-web:

- **`select-name` (critical, 200 nodes).** The action queue's per-row
  assign picker had no accessible name. The visible "Assign to…"
  placeholder option is not a name — a screen reader announced "combo
  box" and nothing else, on every open row. Now named per row, because a
  queue renders many of these and "Assign to" on all of them is barely
  better.
- **`link-in-text-block` (serious, 44 nodes).** Accent links inside dim
  body text, distinguished by colour alone at 2.27:1 against the
  surrounding text (3:1 required). Now underlined. One more of these in
  the creator portal, at 1.53:1.
- **`color-contrast`, one node.** The selected role card's own
  `bg-accent/10` lightened the background enough to tip an
  otherwise-passing token under AA — the one place a tinted surface did
  that.

One finding came from the palette test rather than from axe: the first
fix for the marketing site's `--text-muted` was `#838b98`, which cleared
every combination axe actually flagged and then failed at 4.28:1 on
`--surface-high` — a pairing no page happens to render today. No DOM
audit could have caught it, and the next card built on that surface would
have shipped the failure back. Fixing the palette beats fixing the pages
that use it.

## What is still NOT covered

Automated tools catch perhaps a third of WCAG. None of the following has
been checked, and none of it can be checked by a script:

- **Keyboard order and focus management** — whether tab order follows
  reading order, whether focus moves sensibly on route change, whether
  anything traps focus.
- **Whether a label describes its control.** axe checks a name exists,
  not that it is the right one.
- **Whether errors are announced when they matter**, rather than merely
  present in the DOM.
- **The two React Native apps.** They render no DOM, so axe cannot reach
  them at all. Only their palettes are covered. Touch targets, screen
  reader labels (`accessibilityLabel`), and focus order in `user-mobile`
  and `coach-mobile` are entirely unmeasured.
- **Motion, timing, and zoom** — reflow at 400%, no loss of content at
  320px, prefers-reduced-motion beyond the marketing site.

Closing these needs a person with a screen reader, not another script.
