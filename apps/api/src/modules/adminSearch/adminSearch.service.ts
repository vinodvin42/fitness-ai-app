import { prisma } from "../../db/prisma";
import { hasPermission } from "../../middleware/adminPermissions";
import { AdminSearchQuery } from "./adminSearch.schema";

/**
 * Global cross-entity admin search — R1 Wave 6 (22 Sep 2026), Developer 3's
 * R1 work package. An audit confirmed no global search existed anywhere in
 * admin-web — every directory screen (Users/Professionals/Gyms/Campaigns/
 * Relationships) has its own local, independent search, but there was no
 * single place an admin could type "this user/professional/gym/campaign by
 * name/email/id" and get routed to it.
 *
 * **Scope decision (given, not re-derived here):** exact/prefix match only —
 * a real, simple, fast `WHERE ... ILIKE '<query>%'`-style lookup (Prisma's
 * `startsWith` with `mode: "insensitive"`) plus an exact-match on id. No new
 * search engine, no pg_trgm/full-text-search extension, no fuzzy/typo
 * tolerance, no search history. Same discipline as adminUsers.service.ts's
 * `listUsers()`/gyms.service.ts's `listGyms()` search filters, just fanned
 * out across four tables instead of one.
 *
 * **Which entities are searched, and why:**
 *  - User (fullName/email) — module `users`.
 *  - Professional (fullName/email) — module `professionals`.
 *  - Gym (name/contactEmail) — module `gyms`.
 *  - Campaign (name/linkCode) — module `growth` (Campaigns live under the
 *    `growth` module in PERMISSION_MATRIX, not their own module — see
 *    adminAcquisition.routes.ts, which gates every campaign route the same
 *    way).
 *  - Relationship is deliberately NOT searched here. A Relationship has no
 *    own "name" to match against (it's a User<->Professional pairing) — an
 *    admin who wants to find one is far better served by searching the User
 *    or Professional it involves and navigating to Relationships from
 *    there (both detail screens already surface active pairings). Adding a
 *    fifth branch that matches on, say, a concatenated "User × Professional"
 *    label would be real code for a search need this doesn't actually meet
 *    (you still wouldn't type a relationship's own name — it doesn't have
 *    one) — documented here and in docs/admin/07-open-questions-gaps.md
 *    rather than built.
 *
 * **Permission gating:** each entity type is only searched (and only
 * appears in the response) when the caller's role holds `view` on that
 * type's module, checked with `hasPermission()` — the exact tool that
 * function's own doc comment names for "a conditional/partial gate WITHIN
 * one already-authorized endpoint". The route itself only requires
 * `requireAdminAuth` (any real admin session) with no single blanket
 * `requirePermission` gate, since which entity types a search may touch
 * varies per role — a `support` admin (users:view only) legitimately gets
 * User results and nothing else, not a 403 for the whole endpoint. An
 * unrecognized role gets zero entity types searched at all — the exact
 * same fail-closed behavior `hasPermission()` already guarantees per call,
 * just visible here as "every branch skipped" rather than a thrown error.
 */

const RESULTS_PER_TYPE = 8;

export type AdminSearchResultType = "user" | "professional" | "gym" | "campaign";

export interface AdminSearchResultItem {
  id: string;
  type: AdminSearchResultType;
  label: string;
  sublabel: string | null;
  path: string;
}

function prefixOrExactId(query: string, fields: string[]) {
  return {
    OR: [
      { id: { equals: query } },
      ...fields.map((field) => ({ [field]: { startsWith: query, mode: "insensitive" as const } })),
    ],
  };
}

async function searchUsers(query: string): Promise<AdminSearchResultItem[]> {
  const users = await prisma.user.findMany({
    where: prefixOrExactId(query, ["fullName", "email"]),
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
    take: RESULTS_PER_TYPE,
  });
  return users.map((u) => ({
    id: u.id,
    type: "user" as const,
    label: u.fullName,
    sublabel: u.email,
    path: `/users/${u.id}`,
  }));
}

async function searchProfessionals(query: string): Promise<AdminSearchResultItem[]> {
  const professionals = await prisma.professional.findMany({
    where: prefixOrExactId(query, ["fullName", "email"]),
    select: { id: true, fullName: true, email: true },
    orderBy: { fullName: "asc" },
    take: RESULTS_PER_TYPE,
  });
  return professionals.map((p) => ({
    id: p.id,
    type: "professional" as const,
    label: p.fullName,
    sublabel: p.email,
    path: `/professionals/${p.id}`,
  }));
}

async function searchGyms(query: string): Promise<AdminSearchResultItem[]> {
  const gyms = await prisma.gym.findMany({
    where: prefixOrExactId(query, ["name", "contactEmail"]),
    select: { id: true, name: true, contactEmail: true },
    orderBy: { name: "asc" },
    take: RESULTS_PER_TYPE,
  });
  return gyms.map((g) => ({
    id: g.id,
    type: "gym" as const,
    label: g.name,
    sublabel: g.contactEmail,
    path: `/gyms/${g.id}`,
  }));
}

async function searchCampaigns(query: string): Promise<AdminSearchResultItem[]> {
  const campaigns = await prisma.campaign.findMany({
    where: prefixOrExactId(query, ["name", "linkCode"]),
    select: { id: true, name: true, linkCode: true },
    orderBy: { name: "asc" },
    take: RESULTS_PER_TYPE,
  });
  // No `/campaigns/:id` (or `/growth/campaigns/:id`) detail route exists in
  // admin-web — Campaigns only have the CampaignDirectoryScreen list at
  // `/growth/campaigns` (see App.tsx's real route table). Rather than invent
  // a detail route this wave doesn't own, every campaign result links to
  // that directory with its own linkCode as a `q` query param —
  // CampaignDirectoryScreen doesn't read it today, so this is an honest
  // "get the admin to the right screen" link, not a claim of a working
  // deep-link filter. Documented as a real, deliberate wave boundary in
  // docs/admin/07-open-questions-gaps.md rather than silently guessed at.
  return campaigns.map((c) => ({
    id: c.id,
    type: "campaign" as const,
    label: c.name,
    sublabel: c.linkCode,
    path: `/growth/campaigns?q=${encodeURIComponent(c.linkCode)}`,
  }));
}

export async function globalSearch(role: string | undefined, input: AdminSearchQuery) {
  const query = input.q;

  const [users, professionals, gyms, campaigns] = await Promise.all([
    hasPermission(role, "users", "view") ? searchUsers(query) : Promise.resolve([]),
    hasPermission(role, "professionals", "view") ? searchProfessionals(query) : Promise.resolve([]),
    hasPermission(role, "gyms", "view") ? searchGyms(query) : Promise.resolve([]),
    hasPermission(role, "growth", "view") ? searchCampaigns(query) : Promise.resolve([]),
  ]);

  return {
    query,
    results: [...users, ...professionals, ...gyms, ...campaigns],
  };
}
