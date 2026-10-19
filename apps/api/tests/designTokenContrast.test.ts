import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WCAG 2.1 AA contrast, asserted against the five palettes this repo
 * ships — the two React Native token files, the marketing site's CSS
 * custom properties, and the three consoles' Tailwind theme blocks.
 *
 * It lives in the API's suite because this is the only workspace with a
 * test runner (see docs/mobile/i18n.md for the npm bug that blocks
 * installing one in user-mobile). Reading five files from a sixth
 * workspace is not elegant; a palette nobody checks is worse.
 *
 * Written on 29 Sep 2026 after the first real accessibility audit of
 * this project. Every palette failed on precisely one token — the
 * dim/muted one — at between 2.55:1 and 3.38:1 against a 4.5:1
 * requirement, and axe-core alone found 189 instances on the marketing
 * site. All five were eyeballed; none had ever been measured. This test
 * is the thing that stops the sixth from being.
 *
 * axe-core covers the rendered DOM (roles, names, landmarks, and
 * contrast as actually composited); this covers the palette itself,
 * including the React Native apps axe cannot reach at all.
 */

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const channels = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const REPO = path.join(__dirname, "../../..");
const read = (p: string) => fs.readFileSync(path.join(REPO, p), "utf8");

/** `  name: "#RRGGBB",` — the React Native token object shape. */
function tsTokens(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/^\s{2}(\w+):\s*"(#[0-9A-Fa-f]{6})"/gm)) out[m[1]] = m[2];
  return out;
}

/**
 * user-mobile's token file holds one palette per theme since the Figma
 * light/dark rewrite (`export const palettes = { dark: {...}, light: {...} }`),
 * so its tokens sit one level deeper than `tsTokens` reads. This returns the
 * `name: "#RRGGBB"` pairs of one scheme's block, found by brace matching.
 */
function tsSchemeTokens(src: string, scheme: "dark" | "light"): Record<string, string> {
  const start = src.indexOf("export const palettes");
  const at = start < 0 ? -1 : src.indexOf(`\n  ${scheme}: {`, start);
  if (at < 0) return {};
  const open = src.indexOf("{", at);
  let depth = 0;
  let end = open;
  for (; end < src.length; end++) {
    if (src[end] === "{") depth++;
    else if (src[end] === "}" && --depth === 0) break;
  }
  const out: Record<string, string> = {};
  for (const m of src.slice(open, end).matchAll(/^\s+(\w+):\s*"(#[0-9A-Fa-f]{6})"/gm)) out[m[1]] = m[2];
  return out;
}

/** `--name: #rrggbb;` — both the CSS custom properties and Tailwind's @theme. */
function cssTokens(src: string, prefix: string, block?: string): Record<string, string> {
  // `block` limits the scan to one rule, which a file with more than one
  // palette needs. apps/landing gained a second on 3 Oct 2026: .band-dark
  // redefines --bg, --text-primary and the rest for the one charcoal
  // section, so that components dropped into it invert without being
  // special-cased. Scanning the whole file meant those values overwrote
  // :root's, and the suite then measured the light theme's text against
  // the dark theme's surfaces — seven failures describing a combination
  // that appears nowhere on the site. Each palette is now read from its
  // own rule, and both are checked.
  let scope = src;
  if (block) {
    const start = src.indexOf(block);
    if (start < 0) return {};
    const open = src.indexOf("{", start);
    const end = src.indexOf("}", open);
    scope = src.slice(open, end);
  }
  const out: Record<string, string> = {};
  for (const m of scope.matchAll(new RegExp(`--${prefix}([\\w-]+):\\s*(#[0-9a-fA-F]{6})`, "g"))) out[m[1]] = m[2];
  return out;
}

type Palette = { name: string; tokens: Record<string, string>; backgrounds: string[]; text: string[] };

// user-mobile, both themes. Since the Figma light/dark rewrite, text uses
// the dedicated AA text tokens (accentText, aiText, successText,
// warningText, dangerText); accent, success, warning, danger, orange,
// pink and aiAccent are fills only (no `color:` use as text in
// apps/user-mobile/src). cyan is still used as text once — the pace figure
// on ActivityTrackerScreen — so it stays on the list.
const USER_MOBILE_TEXT = ["textPrimary", "textSecondary", "textMuted", "accentText", "aiText", "successText", "warningText", "dangerText", "cyan"];

const PALETTES: Palette[] = [
  ...(["dark", "light"] as const).map((scheme) => ({
    name: `user-mobile ${scheme}`,
    tokens: tsSchemeTokens(read("apps/user-mobile/src/theme/tokens.ts"), scheme),
    backgrounds: ["background", "surface", "surfaceRaised", "surfaceHigh"],
    text: USER_MOBILE_TEXT,
  })),
  {
    name: "coach-mobile",
    tokens: tsTokens(read("apps/coach-mobile/src/theme/tokens.ts")),
    backgrounds: ["background", "surface", "surfaceRaised"],
    text: ["textPrimary", "textSecondary", "textMuted", "accent", "accentAlt", "success", "warning", "danger"],
  },
  {
    name: "landing",
    tokens: cssTokens(read("apps/landing/assets/css/styles.css"), "(?:)", ":root"),
    backgrounds: ["bg", "surface", "surface-raised", "surface-high"],
    // orange, pink, cyan and ai-accent joined this list on 3 Oct 2026,
    // when the site went light. They were already used as `color` —
    // `color: var(--orange)`, `var(--pink)`, `var(--cyan)` and
    // `var(--ai-accent)` each appear once in styles.css — so leaving
    // them out was an omission, not a scoping decision. On the dark
    // palette they happened to pass; the light palette had to darken all
    // four, and nothing would have caught it if they had not.
    text: ["text-primary", "text-secondary", "text-muted", "accent", "accent-alt", "success", "warning", "danger", "orange", "pink", "cyan", "ai-accent"],
  },
  {
    // The site's one charcoal section. Fewer tokens are redefined than
    // :root carries, so the text list is the subset .band-dark actually
    // sets; the rest are inherited and already measured above.
    name: "landing dark band",
    tokens: cssTokens(read("apps/landing/assets/css/styles.css"), "(?:)", ".band-dark"),
    backgrounds: ["bg", "surface", "surface-raised", "surface-high"],
    text: ["text-primary", "text-secondary", "text-muted", "accent", "accent-alt"],
  },
  ...["admin-web", "gym-portal", "creator-portal"].map((app) => ({
    name: app,
    tokens: cssTokens(read(`apps/${app}/src/styles/index.css`), "color-"),
    backgrounds: ["canvas", "surface", "surface-raised"],
    text: ["text-primary", "text-secondary", "text-dim", "accent", "danger", "warning", "info"],
  })),
];

describe("design tokens meet WCAG 2.1 AA contrast (4.5:1 for normal text)", () => {
  for (const palette of PALETTES) {
    describe(palette.name, () => {
      const backgrounds = palette.backgrounds.filter((b) => palette.tokens[b]);

      it("parsed real tokens, rather than passing on an empty palette", () => {
        // The parsers are regex over source text and can fail by matching
        // nothing, which would make every assertion below vacuous.
        expect(backgrounds.length).toBeGreaterThan(1);
        expect(palette.text.filter((t) => palette.tokens[t]).length).toBeGreaterThan(3);
      });

      for (const fg of palette.text) {
        it(`${fg} is readable on every surface it can sit on`, () => {
          const colour = palette.tokens[fg];
          expect(colour, `${palette.name} has no token named ${fg}`).toBeTruthy();

          // Asserted against the WORST surface, not the common one: a
          // token that only passes on the darkest background fails the
          // moment a card is raised, which is exactly how #5E6675
          // survived this long.
          for (const bg of backgrounds) {
            const ratio = contrast(colour, palette.tokens[bg]);
            expect(
              ratio,
              `${palette.name}: ${fg} (${colour}) on ${bg} (${palette.tokens[bg]}) is ${ratio.toFixed(2)}:1, below 4.5:1`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        });
      }
    });
  }
});
