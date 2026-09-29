# FynroX — Landing Page

Public marketing/landing page for FynroX. Plain static HTML/CSS/vanilla
JS — no build step, no framework, no npm dependencies. Deploys to Azure
Static Web Apps alongside `apps/admin-web` and `apps/user-mobile`.

## Run it locally

```bash
npm run dev --workspace=apps/landing
```

Serves this folder at `http://localhost:4173` (override with `PORT=xxxx`).
`serve.js` is a ~40-line zero-dependency static file server using only
Node's built-in `http`/`fs` — nothing to `npm install`. You can also just
open `index.html` directly in a browser; the only thing that won't work
without a server is deep-linking straight to a `#hash` on first load in some
browsers, which doesn't matter for how this page is actually used.

## Deploy

Target is Azure Static Web Apps, zero-config: app location `/`, no build
command, output location `/` (this folder is the whole deployable unit).
`staticwebapp.config.json` is already set up (asset caching, a couple of
standard security headers, single-page navigation fallback).

## Before this goes live for real pilot testers

The **Android** download card is a real placeholder, not a finished
feature — see the large HTML comment directly above the Android
`<article class="platform-card">` in `index.html` for the exact three edits
needed once a real APK exists:

1. Run `eas build --platform android --profile preview -e apps/user-mobile`
   from the repo root (needs a free Expo account — see
   `DEPLOY-RUNBOOK.md` §7). It finishes with a real, direct `.apk` URL.
2. Swap that URL into the Android card's `<a href="#android-apk-pending">`.
3. Remove that link's `is-pending` class and `aria-disabled="true"`, and
   change its label from "Coming Soon" to "Download APK".

**iOS** has no link at all yet, on purpose — TestFlight distribution isn't
set up, so there's nothing real to point at. Don't add one until it exists.

## Structure

Every page is a standalone HTML file — no templating, no includes.

- `index.html` — home.
- Spec §8's R1 pages: `how-it-works.html`, `programs.html`,
  `professional-guidance.html`, `gyms.html`, `creators.html`,
  `professionals.html`, `about.html`, `learn.html` (+ one article per
  category), `faq.html`, `safety.html`, `early-access.html`. Plus
  `features.html`, `pricing.html`, `download.html`, `support.html`,
  `gym-invite.html`, `referral.html`, `privacy.html`, `terms.html`,
  `404.html`.
- `assets/css/styles.css` — design tokens ported from
  `apps/user-mobile/src/theme/tokens.ts` (same colors/fonts/radii as the
  shipped app) plus every component style.
- `assets/js/main.js` — header scroll state, the footer year, and the
  mobile nav toggle. Progressive enhancement throughout.
- `assets/js/forms.js` — the Early Access / partner application / contact
  forms (see below).
- `assets/js/invite.js` — resolves a gym or creator code against the API
  before the invite/referral landing promises anything.
- `assets/js/cookie-consent.js` — the consent banner.
- `assets/js/i18n.js` — the translation layer (see below).
- `assets/i18n/en.js` — the English source catalogue, generated. It is
  what a translator is handed, not what the browser reads.
- `assets/favicon.svg` — a small mark echoing the app's own "progress ring"
  component, not a fabricated logo.
- `sync-shell.js` — regenerates the header and footer nav in every page
  (`npm run sync-shell --workspace=apps/landing`). See below.
- `serve.js` — local-only dev server (see above). Not used in production.
- `staticwebapp.config.json` — Azure Static Web Apps config.
- `robots.txt` — allows indexing (nothing on this page is private).

## The nav is generated; the pages are not

There is still no build step. But the header and footer are copy-pasted
into 24 files, and a stale nav on a marketing site is a page nobody can
reach. `sync-shell.js` rewrites the header nav, the footer nav and the
footer bottom bar in every `*.html` from two lists at the top of that
file. It also generates each link's `data-i18n` key, so adding a nav
item cannot leave one string untranslatable. Edit the lists, run
`npm run sync-shell --workspace=apps/landing`, commit the result. It is
idempotent and nothing at deploy time depends on it.

## Translation

The rest of the product uses i18next. This site cannot: no build step,
no framework, and adding either to ship copy would cost more than the
copy is worth. So the same job is done with an attribute and a script.

```html
<h1 data-i18n="index.heroTitle">Training, nutrition, and recovery…</h1>
<p  data-i18n-html="faq.answer">Yes — see the <a href="x">terms</a>.</p>
<meta data-i18n-attr="content:index.metaDescription" name="description" … />
```

**English lives in the HTML, not in the catalogue.** That is the whole
design decision:

- With JavaScript off, or before `i18n.js` runs, the page is complete,
  correct English — not a flash of empty elements or a grid of raw keys.
- Crawlers index the English page exactly as written.
- A missing key is invisible: the element keeps the English already in
  it. i18next, by contrast, renders the key itself — `faq.answer.title`
  as body copy on a public page.

**What it costs, plainly:** every language shares one URL, so only
English is indexable. Per-language URLs need pre-rendering, which needs
a build step. The extraction is the expensive half of that work and it
is not wasted — a generator would read these same attributes.

### Adding a language

1. Copy `assets/i18n/en.js` to `assets/i18n/<code>.js`, change `en` on
   the assignment line, translate the values, leave the keys alone.
   Values for `data-i18n-html` keys carry inline markup because the
   markup sits inside the sentence; keep the tags, move them where the
   target language needs them.
2. Add `{ code: "<code>", label: "<endonym>" }` to `LANGUAGES` in
   `assets/js/i18n.js`.

The footer picker appears by itself once there is more than one
language, and the choice persists in `localStorage`. Today `LANGUAGES`
has one entry, so there is no picker — a control offering languages that
do not exist is worse than no control. (The app's ten Indian languages
are in the same position: only `en` is populated there either.)

### Two rules

1. **Anything that writes text into the DOM must listen for
   `fynrox:i18n`.** Swapping a translated sentence replaces the elements
   inside it, so the footer year and the carried referral code are
   written again on that event. `main.js` and the inline script in
   `download.html` show the pattern.
2. **Regenerate the catalogue after changing copy.** `assets/i18n/en.js`
   is a second copy of the English and two copies drift.
   `apps/api/tests/landingI18n.test.ts` fails on the first divergence,
   on the first unkeyed string, and on a `LANGUAGES` entry with no
   catalogue file.

### Checking it yourself

`?pseudo=1` on any page renders every catalogued string accented
(`Tráíníng, nútrítíón…`). Anything still in plain English on that page
is a string the runtime cannot reach. It is a test, not a language, so
it is not in the picker.

## The forms

`assets/js/forms.js` drives every form on the site against
`POST /public/applications`. The API returns one of three outcomes and the
page renders spec §8's four states from it:

| Outcome | State shown |
| --- | --- |
| `201 created` | success — form hidden, "we've got your details" |
| `200 already_registered` | already-registered — deliberately not an error |
| `400` with `fields[]` | error — each named field marked, first one focused |
| consent unticked | the same 400, with `consentContact` named |

Two rules worth keeping:

1. **No second copy of the validation rules.** Every field message comes
   from the API's own `fields` array. A browser that disagrees with the
   server about what is valid rejects submissions the server would have
   accepted, and nobody finds out.
2. **A network failure is not a rejection.** A dropped connection says so,
   rather than telling a gym its application was declined.

What these replaced was a `mailto:` link, which has exactly one outcome
and produces nothing anyone at FynroX can see or reply to.

## What this page deliberately does not say

No app-store ratings, testimonials, download counts, or user numbers —
there aren't any yet (first pilot hasn't run). No wearable/device sync, no
video exercise demos, no live chat — none of these are built; see
`docs/mobile/07-open-questions-gaps.md` for the full list of what's still
open.

`pricing.html` shows three tiers because the app really does sell three
today. R1 decision D3 collapses them to one FynroX Premium tier, and this
page should change when the plans do — not before. A marketing page that
describes a tier structure the checkout doesn't have is worse than one
that's behind.

No sitemap.xml: the site's production domain isn't settled
(`fynrox.app` is the link domain, `fynrox.com` the email domain), and a
sitemap full of guessed absolute URLs is worse than none.
