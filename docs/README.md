# Documentation Index

Full context is in the [repo root README](../README.md) — this file is just a local map for browsing `docs/` directly.

- **[admin/](admin/)** — Super Admin Console (54 screens). Start at [admin/01-product-requirements.md](admin/01-product-requirements.md).
- **[mobile/](mobile/)** — consumer mobile app (82 screens). Start at [mobile/01-product-requirements.md](mobile/01-product-requirements.md).
- **[coach/](coach/)** — coach/professional app (16 screens). Start at [coach/01-product-requirements.md](coach/01-product-requirements.md).
- **[platform/](platform/)** — cross-cutting docs covering all three apps together: [project-structure.md](platform/project-structure.md) and [roadmap.md](platform/roadmap.md).

Each of `admin/`, `mobile/`, and `coach/` follows the same numbered pattern (product requirements → information architecture → screen inventory → design system → data model → open questions, with `06-cross-app-integration.md` in `mobile/` and `coach/` mapping that app back to the others). If you only have time to read one file across the whole set, read **[coach/06-cross-app-integration.md](coach/06-cross-app-integration.md)** — it documents the highest-priority open finding (a duplicated coach-discovery/booking flow) that affects all three apps.

See also: [../figma-reference/](../figma-reference/) for Figma node-ID lookup tables, one per app.
