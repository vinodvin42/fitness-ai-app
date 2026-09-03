# Design System Notes — Coach App (observed)

Same caveat as the other two apps: `get_variable_defs` returned empty for this file as well — **all three reviewed Figma files publish no design tokens/variables.** Colors below are eyeballed from rendered screenshots.

## 1. Theme and the third accent color

Dark theme, consistent with both other apps. The primary accent here is a **bright lime/yellow-green** (roughly `#D4FF00`–`#C6F000`) — used for primary buttons, active tab, checkmarks, progress bars, and badges. This is a **third distinct accent color** across the three reviewed apps:

| App | Default accent |
|---|---|
| Admin Console | Mint/teal green |
| Consumer app | Blue (with a separate purple "AI accent") |
| Coach app | Lime/yellow-green |

Three different default accents for one product family is very likely unintentional drift rather than a deliberate multi-brand strategy — flagged as a priority open question in [07-open-questions-gaps.md](07-open-questions-gaps.md) §3, since it directly blocks building one shared `packages/ui` token set across all three apps ([../07-project-structure.md](../platform/project-structure.md)).

## 2. Layout & components

- Same 390–402px iOS canvas convention, iOS status bar / home indicator design artifacts, sticky bottom action button pattern (`sticky-footer` / `primary-button`) on nearly every screen — slightly more consistent use of a single sticky CTA button per screen than the consumer app, appropriate for this app's more linear, task-focused screens.
- **Stat tile row** (3 tiles: e.g. Active Clients / Sessions-per-week / Avg Rating) — same shape as the consumer app's metric tiles; should be the same shared component.
- **Verification status badge** (Verified ✓ / Not Verified / Pending, color-coded green/amber) — directly reusable against the admin console's status-pill conventions (green=approved, amber=pending — see [../04-design-system.md](../admin/04-design-system.md) §2), good evidence for one shared `StatusBadge` component across all three apps.
- **Service badge** (Fitness Coach ✓ / Nutrition Professional ✓) recurs on dashboards, client profiles, discovery cards, and profile detail — another clear shared-component candidate.
- **Radio-select list** (booking service selection, change-professional reason) and **checklist row** (client workout checklist) — simple, consistent shapes worth standardizing once across apps.
- Upload slots on the credential-verification screen (icon + label + "drag or tap to upload" + file-type/size hint) match the *concept* of the admin console's credential document links (03.03) closely enough that the same file-upload/preview component could serve both the coach's upload flow and the admin's document-review flow.

## 3. Consistency check against the other two apps

- Icon language again resembles Lucide (`dumbbell`, `leaf`, `check`, `alert-circle`, `shield-user`, `cloud-upload`, etc.), consistent with both other files — third confirmation this is (or should be) one shared icon set.
- Typography hierarchy (bold large numerals for stats, small uppercase section labels, regular body text) matches both other apps.
- Card-based, spacious, mobile-native layout matches the consumer app's approach (as opposed to the admin console's dense tables) — appropriate, since this is also a phone app.

## 4. Gaps

- No empty/loading/error states (same pattern as both other apps).
- No Android/tablet layouts.
- No design tokens published (same as both other apps) — a single token-extraction/definition pass covering all three files at once would be far more efficient than three separate ones.
