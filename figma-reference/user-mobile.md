# Figma Screen → Node ID Map — Mobile App

File: **v1-user** — `fileKey: goXnXRimiQom0cq8p8Mvtj`
Base URL for any node: `https://www.figma.com/design/goXnXRimiQom0cq8p8Mvtj/v1-user?node-id=<id-with-dash>`
(e.g. node `17:278` → `...?node-id=17-278`)

Single page ("01 - Design System", `9:2`), 82 top-level frames, one per screen, each 390×844.

| Group | Screen | Node ID |
|---|---|---|
| Onboarding | Splash/Welcome | `17:278` |
| Onboarding | Login/Register | `17:305` |
| Onboarding | OTP Verification | `17:368` |
| Onboarding | Setup: About You | `17:407` |
| Onboarding | Setup: Goals | `17:497` |
| Onboarding | Setup: Training Level | `17:551` |
| Onboarding | Setup: Food/Diet | `17:611` |
| Onboarding | Setup: Safety | `17:699` |
| Today | Home Dashboard | `17:781` |
| Today | Notifications | `17:966` |
| Today | Search | `17:1050` |
| Today | Schedule | `17:1136` |
| Today | More Menu | `95:5` |
| Train | Train Dashboard | `17:1232` |
| Train | Training Programs | `17:1372` |
| Train | Program Detail | `17:1550` |
| Train | Workout Detail | `17:1725` |
| Train | Exercise Library | `17:1860` |
| Train | Exercise Detail | `17:2017` |
| Train | Active Workout | `17:2145` |
| Train | Set/Rest Tracker | `17:2279` |
| Train | Exercise Swap | `17:2384` |
| Train | Workout Complete | `17:2497` |
| Train | Workout History | `17:2595` |
| Train | Training Analytics | `17:2727` |
| Train | My Routines | `17:2839` |
| Train | Running Tracker | `17:2980` |
| Train | Cycling Tracker | `17:3077` |
| Train | Workout Settings | `17:3165` |
| Fuel | Nutrition Dashboard | `17:3274` |
| Fuel | Log Meal | `17:3395` |
| Fuel | Barcode Scanner | `17:3505` |
| Fuel | Recipes | `17:3571` |
| Fuel | Recipe Detail | `17:3661` |
| Fuel | Meal Plan | `17:3745` |
| Fuel | Nutrition Calendar | `17:3848` |
| Recover | Recovery Dashboard | `17:4006` |
| Recover | Connected Devices Hub | `17:4128` |
| Recover | Add Device | `17:4305` |
| Recover | Device Pairing | `17:4499` |
| Recover | Sync Dashboard | `17:4613` |
| Progress | Progress Overview | `17:4861` |
| Progress | Body Composition | `17:5019` |
| Progress | Body Measurements | `17:5132` |
| Progress | Log Measurements | `17:5296` |
| Progress | Streak Tracker | `17:5521` |
| Progress | Progress Photos | `17:5741` |
| Progress | AI Insights | `17:5823` |
| Timeline | Timeline Overview | `17:5916` |
| Timeline | Timeline Month | `17:6080` |
| Timeline | Timeline Event | `17:6199` |
| Timeline | Timeline Report | `17:6282` |
| AI Coach | AI Coach Chat | `17:6359` |
| Programs | Program Purchase | `17:6446` |
| Programs | Program Progress | `17:6541` |
| Programs | Program Completion | `17:6668` |
| Programs | My Programs | `85:4` |
| Coaching | Find a Coach | `17:6775` |
| Coaching | Coach Booking | `17:6874` |
| Coaching | Coach Messaging | `17:6955` |
| Coaching | Coach Session Summary | `17:7056` |
| Reminders | Add Reminder | `17:7156` |
| Settings | Language Selection | `17:7868` |
| Settings | Health Connect Settings | `17:7949` |
| Settings | Notification Settings | `17:8028` |
| Settings | Security | `17:8211` |
| Settings | Support | `17:8298` |
| Settings | Data & Privacy | `17:8402` |
| Subscription | Subscription Plans | `17:8505` |
| Subscription | Payment Checkout | `17:8619` |
| Subscription | Payment Success | `17:8713` |
| Subscription | Payment Failed | `17:8786` |
| Subscription | Subscription Management | `17:8843` |
| Subscription | Purchase History | `17:8940` |
| Subscription | Subscription Cancel | `17:9054` |
| Profile | Profile | `53:532` |
| Profile | View/Edit Profile | `56:5` |
| Profile | Preferences | `60:4` |
| Profile | Membership Details | `68:4` |
| Profile | Measurement Units | `70:4` |
| Profile | Accent Colour | `77:4` |
| Referral | Refer & Invite | `75:28` |

82 rows = 82 screens (verified against the frame count read from Figma metadata).

## How this map was built

Same method as [admin-web.md](admin-web.md) (the admin console's map): `get_metadata` on the page root (`9:2`) returns the full layer tree; top-level `<frame>` children are the 82 screens. Cross-checked against `get_screenshot` renders for a representative sample across every module (Onboarding ×3, Today, Train ×2, Fuel ×1, Recover ×1, Progress ×1, Timeline ×1, AI Coach, Programs, Coaching, Subscription, Profile) to confirm the visual language documented in [../docs/mobile/04-design-system.md](../docs/mobile/04-design-system.md).
