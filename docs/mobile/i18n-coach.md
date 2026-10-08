# Translating the professional app

`apps/coach-mobile`. Same mechanism as the user app — see
`docs/mobile/i18n.md` for the reasoning behind the library choice and the
patterns worth copying; this page only records what is different here.

## State

**Complete.** `node scripts/i18n-report.mjs` reports 38 components, 0
inline user-facing strings (159 before this pass).

## There is no language preference yet

This is the one real difference from the user app, and it is worth being
plain about. A `User` carries a `languagePreference` column; a
`Professional` does not. So there is nothing for this app to read, and
**no language selector is shown** — a picker that saved nowhere would be
worse than none at all.

`applyLanguagePreference()` exists in `src/i18n/index.ts` and is correct.
Wiring it up is one line in `AuthContext` the day the API grows that
field, plus the field itself and a screen to set it.

Until then every professional sees English, which is the same outcome as
before this work — except that the copy is now in one file a translator
can be handed.

## What is deliberately not in the catalogue

- **Product names.** `FynroX`, and `FynroX Coach` on the splash screen,
  which now comes from `BRAND_NAME` in `packages/config` rather than a
  literal — the spec's "one constant so a rename is one change".
- **Anything the API sends back**: a decline reason, a client's name, a
  service label, a lifecycle status the server has already worded. Those
  are the API's to translate.

## Guard

`apps/api/tests/i18nCatalogue.test.ts` covers both apps through
`describe.each`. It asserts, per app, that every `t()` call resolves to a
real key (i18next renders the key itself otherwise, as visible text) and
that every catalogue key is reached by something. Verified against
coach-mobile specifically by breaking a key and watching it fail.

One coach-specific find worth recording: the stuck-relationships banner on
Today branched on `items.length === 1` to choose between "This client
relationship" and "These N client relationships". Correct in English,
silently malformed in most of the ten languages the catalogue is built
for. It is a CLDR plural now.
