# Figma Screen → Node ID Map — Coach App

File: **v1-coach** — `fileKey: rWjLV3qEnwuEy6Avuo7ggT`
Base URL for any node: `https://www.figma.com/design/rWjLV3qEnwuEy6Avuo7ggT/v1-coach?node-id=<id-with-dash>`
(e.g. node `16:5` → `...?node-id=16-5`)

Single page ("Page 1", `0:1`), 16 top-level frames, one per screen (~402px wide, iOS).

| Group | Screen | Figma layer name | Node ID |
|---|---|---|---|
| Auth | Coach Signup | `coach-signup` | `16:5` |
| Auth | Coach Login | `coach-login` | `16:68` |
| Onboarding | Service Selection | `professional-onboarding-service-selection` | `2:11` |
| Onboarding | Credential Verification Upload | `professional-onboarding-fitness-verification` | `2:57` |
| Onboarding | Verification Status | `professional-onboarding-verification-status` | `2:109` |
| Dashboard | Fitness-only Dashboard | `professional-dashboard-fitness-only` | `2:635` |
| Dashboard | Nutrition-only Dashboard | `professional-dashboard-nutrition-only` | `2:747` |
| Dashboard | Combined Dashboard | `professional-dashboard-combined` | `2:859` |
| Clients | Client Profile (Fitness) | `coach-client-profile-fitness` | `2:939` |
| Discovery/Booking | Discovery Filters | `user-coach-discovery-filters` | `2:147` |
| Discovery/Booking | Discovery List | `user-coach-discovery-list` | `2:197` |
| Discovery/Booking | Coach Profile Detail | `coach-profile-detail` | `2:308` |
| Discovery/Booking | Booking: Service Selection | `booking-service-selection` | `2:378` |
| Discovery/Booking | Booking Confirmation | `booking-confirmation` | `2:450` |
| Relationship mgmt | My Professional Team | `user-my-professional-team` | `2:1015` |
| Relationship mgmt | Change Professional | `user-change-professional` | `2:1111` |

16 rows = 16 screens (verified against the frame count read from Figma metadata).

## How this map was built

Same method as the other two maps in this folder: `get_metadata` on the page root (`0:1`) returns the full layer tree; top-level `<frame>` children are the 16 screens. All 16 were individually screenshotted (not just a sample, given the small screen count) to confirm the visual language documented in [../docs/coach/04-design-system.md](../docs/coach/04-design-system.md) and the screen-by-screen detail in [../docs/coach/03-screen-inventory.md](../docs/coach/03-screen-inventory.md).
