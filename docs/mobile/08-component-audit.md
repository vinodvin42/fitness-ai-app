# 08 — Component & theme audit (user-mobile)

Date: 16 Oct 2026 · Branch `blueprint-p1-p2` · Scope: `apps/user-mobile`

## Decision

Keep the FynroX component library. **We are not migrating to React Native Paper.** Material Design 3 is our guide for *how things behave*: touch targets, pressed states and type roles. It is not a component kit, and Material does not set how things look. Colours, type and shapes come from the approved Figma design system: file `goXnXRimiQom0cq8p8Mvtj`, page `00 — FynroX Design System` (`166:651`), dark variables on `166:2234` and light on `166:463`.

Who this is for: Indian beginner and intermediate gym users. They read the app mid-set, in bright gyms, often with sweaty hands, and are often new to fitness words. So we treat legibility (AA contrast for all small text), 48 dp touch targets and plain labels as requirements, not polish.

## 1. Token audit — Figma → code

`src/theme/tokens.ts` now holds two palettes (`palettes.dark`, `palettes.light`) taken from the Figma variables, plus four accent options per mode (`accentPalettes`).

| Figma variable | Code token | Dark | Light |
|---|---|---|---|
| background/canvas | `background` | #12171a | #f4f7f9 |
| surface/card | `surface` | #1c252a | #ffffff |
| surface/raised | `surfaceRaised` | #25353f | **#ebf0f3 (derived)** |
| surface/muted, border/subtle | `surfaceHigh`, `border` | #2c373d | #e3ebf0 / #d5dee3 |
| text/primary | `textPrimary` | #ffffff | #12171a |
| text/secondary | `textSecondary` | #b0b8c6 | #3f4e54 |
| text/on-accent | `textOnAccent` | #04121c | #ffffff |
| action/primary | `accent` | #0090e0 | #0077c2 |
| ai/accent | `aiAccent` | #a78bfa | #6d28d9 |
| status success / warning / error | `success` / `warning` / `danger` | #00f098 / #e89820 / #fb7185 | #00875f / #b26b00 / — |
| data protein / carbs / fat | `dataProtein` / `dataCarbs` / `dataFat` | #60a5fa / #2dd4bf / #a5b4fc | same |
| Typeface | `fonts.*` | Inter 400–800 | same |
| Spacing / radius | `spacing`, `radius` | 4–32 / 4–20, pill | same |

### Gaps found in the approved palette, and the derived tokens that fix them

Several Figma fill colours are too faint to use as small text (WCAG AA needs 4.5:1). Code now keeps the fill colour and adds a separate `*Text` token for labels. Every derived value is marked `(derived)` in `tokens.ts` and **needs design sign-off**. Contrast below is the *worst case* across card, raised and muted surfaces and the token's own soft tint.

| Token | Dark | Light | Why |
|---|---|---|---|
| `accentText` | #5cbaf0 (4.71) | #00609e (4.84) | #0090e0 is 3.5:1 on raised; #0077c2 is 4.4:1 on canvas |
| `aiText` | #bba7fc (4.57) | #6d28d9 (5.06) | #a78bfa is 3.5:1 on its own tint |
| `successText` | #00f098 (5.90) | #006f4f (4.56) | #00875f is 4.0:1 on muted |
| `warningText` | #f0a63a (4.54) | #875100 (4.76) | both status fills are under 4.5:1 |
| `dangerText` | #fe97a6 (4.75) | #b0103a (4.93) | light has no published error colour |
| `surfaceRaised` (light) | — | #ebf0f3 | Figma light "raised" = card white, so inputs, chips and RPE buttons inside cards disappeared |
| `ripple` | rgba(255,255,255,.10) | rgba(18,23,26,.08) | Material pressed state layer |
| Accent options (light) | — | green #03684b, yellow #875100, red #b0103a as `accentText` | same AA rule for the user-chosen accent |

The text-colour rule is enforced in code. All 218 places in 93 files that used a fill colour as a `color:` text style now use the matching `*Text` token. Fills, borders and icons still use the fill colour; they only need 3:1.

## 2. Theme architecture fix (central, no per-screen rewrites)

The problem: about 60 module-level `StyleSheet.create` / tone maps read `colors` once at import, so a theme change could never reach them. They were frozen dark.

The fix, all in `theme/`:
- `colors` is one live object. `applyTheme(scheme, accent)` rewrites it and bumps a version.
- `themed(() => …)` wraps every module-level style or tone map. It is a lazy proxy that rebuilds when the version changes. 59 sites in 56 files were wrapped by script.
- `ThemeProvider` takes `mode: "system" | "light" | "dark"`, stored in AsyncStorage (`fynrox.themeMode`). The default is **Same as phone**; if the phone reports nothing, it falls back to dark.
- `RootNavigator` remounts `NavigationContainer` on a theme change and keeps navigation state, so render-time `colors.*` reads also update.
- `App.tsx` loads Inter and sets the status bar style per scheme.
- Unit check (`applyTheme` dark → light → light+green → dark): themed styles, tone maps and object spread all update, and repeat calls are no-ops.

## 3. Shared component gaps and fixes

| Component | Gap | Fix |
|---|---|---|
| Button | no pressed feedback | `android_ripple` + dimmed pressed state on iOS/web; 52 px height kept |
| Chip | ~31 px tall; danger/outlined text below AA | 40 px visual + 4 px hitSlop = 48 dp; ripple; `dangerText` / `accentText` |
| Pill | no info tone; text below AA | `info` tone; text uses `*Text` tokens |
| Stepper | 40 px buttons | 48 px (`touch.min`); ripple; `accentText` icons |
| SegmentedControl | ~36 px segments, 13 px text | 42 px + track padding/hitSlop = 48 dp; 14 px label |
| SelectCard, ListRow, ValueRow | no pressed state | ripple + pressed dim; ValueRow min 48 dp |
| ToggleRow (Switch) | track/thumb tuned only for dark | `borderStrong` off-track, Android thumb and iOS background per mode |
| StatePanels back, WizardLayout back | 32 px | hitSlop to 48 dp |
| **IconButton (new)** | 24 places in screens hand-roll 32–40 px icon buttons | Figma "FX/Icon button": 36 px visual, 48 dp target, `accessibilityLabel` required, tonal/plain/accent |
| Appearance screen | said "single dark theme"; no theme choice | Theme: Same as phone / Light / Dark. Swatches show the exact accent for the current mode (Preferences screen too) |
| Typography | 13 px labels and buttons; no line heights | scale below |

### Type scale (validated, see §5)

| Role | Before | After | Notes |
|---|---|---|---|
| display | 34 | 30/36 | Figma tops out at 22–30 for headings |
| metricLarge | 40 | 40/46 | tabular numbers |
| h1 | 26 | 24/30 | |
| h2 | 18 | 19/25 | |
| h3 | 15 | 16/22 | card titles |
| body | 16 | 16/24 | Material body-large |
| bodySmall | — | 14/20 | new; Material body-medium |
| label | 13 | **14/20** | Material label-large; buttons, chips, links |
| meta / caption | 13 | 13/18 | floor: nothing below 13 px in shared components |

## 4. Material interaction rules we follow

1. Touch target ≥ 48 dp (`touch.min`). Keep the Figma visual size and use `hitSlop` to make up the rest.
2. Every pressable gives feedback: ripple on Android (`colors.ripple`), a pressed dim on iOS.
3. Icon-only controls need an `accessibilityLabel`. `IconButton` makes it required.
4. Selection is never shown by colour alone: check, dot, radio or weight change, plus `accessibilityState`.
5. Small text uses `*Text` tokens. Fills use base tokens.
6. Disabled controls stay readable or say why; they don't silently vanish.

## 5. Validation on representative screens

Method: the real screen code was rendered in Chromium through a react-native → DOM shim, with API, auth and navigation mocked and Inter loaded. Before = `HEAD` (dark only). After = this change, in dark and light. Screens: Today, Food (Fuel), Log Food, Active Workout, More, Onboarding (About You, Goals), Subscription, Appearance, and a component kit sheet. Automated checks ran on every visible text node and control. This shim is not a device test; final sign-off still needs one run on a mid-range Android phone and an iPhone.

| Check | Before (dark) | After (dark) | After (light) |
|---|---|---|---|
| Render crashes | 0 | 0 | 0 |
| Text below AA (opacity ≥ 0.6) | 0* | 0 | 0 |
| Horizontal overflow | 0 | 0 | 0 |
| Text < 12 px | 0 | 0 | 0 |
| Controls < 48 dp (Goals / Log Food / kit) | 9 / 13 / 12 | 0 / 6 / 2 | same |

\* The old teal-on-black palette passed, but it was not the approved palette. Moving to the approved blue first produced 5 AA failures in dark and 9 in light, all of them accent, AI or status colours used as small text. That is what led to the `*Text` tokens; the counts after the fix are 0.

What else the validation caught and fixed:
- Light mode: inputs, the 1–10 effort buttons and the macro boxes were invisible inside cards (raised = card white). Fixed with the derived light `surfaceRaised`.
- Active Workout: effort buttons went from 32 → 44 px tall (+ slop = 48).
- Log Food: quick-add went from 28 px → 48 dp target. Food: the water "+" button went from 32 px → 48 dp target.
- Copy test (terminology alternatives, at the 13 px tab label): "Workouts" 61 px and "Recovery" 59 px both fit the 78 px tab cell. "How ready do you feel today?" (229 px at 16 px) fits as a card heading but not as a tile label.

## 6. Backlog (not changed in this pass)

These are screen-level fixes to roll out using the shared components above, in order of the product priorities (workout logging and food entry first):
- Active Workout: the 1–10 effort row is ~29 px wide per button at 390 px. Proposal for design: 2 rows of 5, or a 1–10 slider. The pause timer button is 44 → `IconButton`.
- Log Food: the saved-meal heart (40), remove-saved (34) and "Quick Log" link (36) → `IconButton` / 48 dp link.
- Today: inline text links ("Log meal", "See recipes", "Open schedule") are 20–36 px tall. Move them to a shared `TextLink` with 48 dp height.
- About You: the KG/LBS and CM/FT toggles are 32 px → `SegmentedControl`.
- 24 hand-rolled icon buttons across screens → `IconButton`.
- Design question: in light mode the secondary button sits on `surfaceRaised` (light grey). Figma may want white with a border.
- Navigation at 320 px wide (small Android): "Workouts" leaves about 3 px spare in a 64 px tab. Check on a real small device.
- Hindi and other Indian scripts: Inter has no Devanagari, Tamil and so on, so those fall back to the system font (Noto on Android). Check line heights with real Hindi copy before translations ship.

## 7. Third-party UI policy

Add a third-party UI library only when there is a specific need our components can't meet: for example portals/overlays, date/time pickers, bottom-sheet gestures or virtualised lists. Before adding one:
1. **Compatibility.** It works with Expo SDK 51 / RN 0.74 and New Architecture, runs on web via react-native-web, and needs no native module outside Expo's prebuild.
2. **Accessibility.** It supports screen readers (roles, labels, focus order), dynamic type, 48 dp targets and reduced motion.
3. **Wrapper.** Screens never import it directly. It sits behind a `components/` wrapper, for example `FxDatePicker`, that takes FynroX tokens, so it can be swapped out later.
4. **Record it.** Note the need, the alternatives checked and the bundle size impact in this doc.

React Native Paper was considered and declined: its Material 3 theme would compete with the approved FynroX tokens, and the migration would touch about 130 screens. If we ever need one of its pieces, for example the Portal, the same four rules apply.

## 8. Follow-ups for whoever pulls this

- Run `npm install` at the repo root. `@expo-google-fonts/inter` replaces sora, manrope and jetbrains-mono, and `package-lock.json` must be regenerated (this environment could not reach the npm registry).
- Design sign-off is needed on every `(derived)` token in §1.


## 9. Refinement pass (16 Oct 2026, after kit review)

### Change log
- **Real icons in the kit.** The square glyphs were a gap in the preview harness, not the app. The renders now use the actual lucide icons that `Icon.tsx` maps (minus/plus on the stepper, pause, check and so on).
- **Numbers.** New `MetricValue` component: tabular figures, the unit about half-size in secondary colour on the same baseline, single line, shrinking instead of wrapping. Sizes are `large` (metricLarge 40/46), `medium` (h1) and `small` (h3). `StatTile` takes an optional `unit`. The type spec and realistic usage are separate kit sections.
- **Navigation labels: Today · Workouts · Food · Recovery · More.** These are plain words for beginner and intermediate users, the words they already use. "Fuel" and "Recover" are coach jargon, and the plain words translate more directly. Applied in `nav.*`, the tab-root titles (Workouts, Food), and the screen copy that named a tab ("in Recovery", "the Workouts tab"). Route ids stay `Train/Fuel/Recover`. Icons and label keys now live in `navigation/tabConfig.ts`, and the label style in `typography.tabLabel`, shared by MainTabs and the kit. Fit is measured below. The Figma "Navigation/Bottom" component still says Train/Fuel/Recover and needs updating.
- **Contrast tokens.** New `outline` token (dark #748390, light #6f7f8a, ≥ 3:1 on every surface). It is used where the edge is the only thing that identifies a control: text-input borders, off switches and empty radios. These were about 1.3:1. New `focus` token (dark #5cbaf0, light #00609e). The active tab now uses `accentText`.
- **States implemented in shared components** (`FocusRing` + `useFocusState`):
  - Button: pressed, focused, disabled (flat grey with a readable label; replaces the faded accent), loading (keeps full colour, because busy is not unavailable).
  - TextField: default, focused (2 px focus border), filled, error (2 px dangerText border + message), disabled (`editable={false}`: muted fill, readable value).
  - SelectCard, Chip, SegmentedControl (whole control or one option): selected, unselected, focused, disabled. SelectCard and Chip gained a `disabled` prop.
  - ToggleRow: on, off, focused, disabled. The whole row is now the switch (≥ 48 dp target), announced once to screen readers.
  - IconButton: focused.
  - Disabled rows and cards dim only the title, icon and control. The subtitle that says *why* stays readable.

### Contrast (computed from token values, worst case across canvas / card / raised / muted)

| Role | Dark | Light | Need |
|---|---|---|---|
| textPrimary | 12.20 | 14.97 | 4.5 |
| textSecondary | 6.11 | 7.17 | 4.5 |
| textMuted (meta, helper, placeholder, inactive tab) | 4.57 | 4.58 | 4.5 |
| accentText (links, active tab) | 5.66 | 5.50 | 4.5 |
| status/AI text on its own tint | 4.69–6.10 | 4.79–5.28 | 4.5 |
| textOnAccent on each accent option | 5.47–11.13 | 4.75–6.29 | 4.5 |
| outline (input edge, off switch, empty radio) | 3.13 | 3.43 | 3 |
| accent (selected fill, switch on) | 3.52 | 3.94 | 3 |
| focus ring | 5.66 | 5.50 | 3 |
| border (card edges, dividers) | decorative | decorative | — |
| Disabled button label (grey) | 4.57 | 4.58 | exempt |
| Disabled chip / segment labels (45% opacity, measured) | 2.2–2.7 | 2.1–2.2 | exempt |

Status of the measured renders (9 screens + 2 kit pages, both themes): 0 readable-text failures, 0 overflow. The only text below 4.5:1 is intentionally disabled.

### Navigation fit (Inter Semibold 13, measured)

| Width | Tab cell | Workouts | Recovery | Clipped |
|---|---|---|---|---|
| 390 px | 78 px | 61 px (17 spare) | 59 px (19 spare) | none |
| 360 px | 72 px | 61 px (11 spare) | 59 px (13 spare) | none |

### Implemented vs presentation
- **Implemented in app code:** all tokens (one semantic `Palette` with dark and light values, swapped by `applyTheme`), every component in the kit, every state shown, `MetricValue`, `tabConfig`, `typography.tabLabel`. Both themes use the same components and tokens; nothing is styled twice.
- **Presentation only:** the kit pages themselves (they live in the preview harness, not in the app), and the way pressed/focused are frozen for the screenshot. In the app, pressed comes from touch and focused from keyboard, switch access or D-pad. On Android, pressed also shows a ripple, which a static render can't show.
