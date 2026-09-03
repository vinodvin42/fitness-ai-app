# Figma Screen → Node ID Map

File: **vi-admin** — `fileKey: QFkdCAZdSnuM9slK5lkvf8`
Base URL for any node: `https://www.figma.com/design/QFkdCAZdSnuM9slK5lkvf8/vi-admin?node-id=<id-with-dash>`
(e.g. node `2:7` → `...?node-id=2-7`)

Single page ("Page 1", `0:1`), 54 top-level frames, one per screen.

| # | Screen | Node ID |
|---|---|---|
| 01.01 | Executive Dashboard | `2:7` |
| 02.01 | User Directory | `2:446` |
| 02.02 | User Profile | `2:1068` |
| 03.01 | Professional Directory | `7:6` |
| 03.02 | Professional Profile | `7:582` |
| 03.03 | Credential Verification | `7:850` |
| 04.01 | Relationship Directory | `8:6` |
| 04.02 | Relationship Detail | `8:495` |
| 04.03 | Change / Intervention Queue | `8:786` |
| 05.01 | Programs | `11:6` |
| 05.02 | Exercises | `25:7` |
| 05.03 | Recipes | `25:314` |
| 05.04 | Educational Content | `25:648` |
| 05.05 | Review / Approval | `25:955` |
| 06.01 | Subscriptions | `11:404` |
| 06.02 | Transactions | `11:648` |
| 06.03 | Payments | `25:1299` |
| 06.04 | Refunds | `25:1565` |
| 06.05 | Pricing / Coupons | `25:1830` |
| 07.01 | Influencers | `11:938` |
| 07.02 | Influencer Detail | `11:1371` |
| 07.03 | Referrals | `11:1766` |
| 07.04 | Campaigns & Attribution | `25:2081` |
| 08.01 | Support Tickets | `15:6` |
| 08.02 | Escalations | `25:2348` |
| 08.03 | Complaints | `25:2529` |
| 08.04 | Safety / Abuse Reports | `25:2696` |
| 09.01 | User Analytics | `12:6` |
| 09.02 | Engagement | `25:2860` |
| 09.03 | Fitness & Nutrition | `12:430` |
| 09.04 | Business Analytics | `12:722` |
| 09.05 | Geographic Analytics | `25:3357` |
| 09.06 | Unit Economics / Cohorts | `23:4` |
| 10.01 | Finance Dashboard | `18:6` |
| 10.02 | Revenue | `18:258` |
| 10.03 | Expenses & Payouts | `18:574` |
| 10.04 | Invoices | `18:852` |
| 10.05 | Receivables & Payables | `18:1362` |
| 10.06 | Coach Settlements | `18:1795` |
| 10.07 | Influencer Payouts | `18:2051` |
| 10.08 | Taxes & Compliance | `18:2676` |
| 10.09 | Bank / Payment Accounts | `18:2921` |
| 10.10 | Financial Reports | `18:3187` |
| 11.01 | AI Features & Models | `25:3578` |
| 11.02 | AI Usage & Metrics | `25:3813` |
| 11.03 | AI Safety / Overrides | `25:4003` |
| 12.01 | Admin Users | `16:226` |
| 12.02 | Roles & Permissions | `15:358` |
| 12.03 | Audit Logs | `15:801` |
| 12.04 | Privacy & Data Governance | `25:4212` |
| 12.05 | Security | `25:4460` |
| 12.06 | Integrations | `25:4665` |
| 12.07 | Notifications | `25:4882` |
| 12.08 | Platform Settings | `16:7` |

## How this map was built

Pulled via the Figma MCP `get_metadata` tool on the page root (`0:1`), which returns an XML layer tree; top-level `<frame>` children of the canvas are the 54 screens. Cross-checked against `get_screenshot` renders for a representative sample across every module (Dashboard, Users, Professionals ×2, Relationships, Programs, Commerce/Finance, Growth, Support, Analytics, AI Operations, Admin/RBAC) to confirm the visual language and page anatomy documented in [../docs/04-design-system.md](../docs/admin/04-design-system.md) and [../docs/03-screen-inventory.md](../docs/admin/03-screen-inventory.md).
