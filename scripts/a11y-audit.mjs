#!/usr/bin/env node
/*
 * axe-core accessibility audit, WCAG 2.1 A/AA, over every web surface in
 * this repo: the 24 marketing pages, and the three consoles behind a
 * real login.
 *
 * Run it:
 *
 *   npm i --no-save axe-core playwright
 *   node scripts/a11y-audit.mjs                 # marketing site only
 *   node scripts/a11y-audit.mjs --apps          # + consoles (needs the API,
 *                                               #   the dev servers, and a
 *                                               #   seeded login — see below)
 *
 * Deliberately NOT a repo dependency. axe-core and playwright together
 * are large, and `npm install` in this workspace has its own history of
 * breaking (see docs/mobile/i18n.md). An audit tool that makes the
 * install fragile is an audit tool nobody will run.
 *
 * What this does NOT cover, and no automated tool does: keyboard order,
 * focus management on route change, whether a label actually describes
 * its control, whether an error message is announced at the moment it
 * matters, or anything about the two React Native apps (which render no
 * DOM at all). Their palettes are covered by
 * apps/api/tests/designTokenContrast.test.ts, which runs in CI; the rest
 * needs a person.
 *
 * First run, 29 Sep 2026: 189 contrast failures on the marketing site,
 * 200 unnamed selects and 44 colour-only links in admin-web, one
 * colour-only link in the creator portal. Every contrast failure traced
 * to a single token per palette.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium, axeSource;
try {
  ({ chromium } = require('playwright'));
  axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
} catch {
  console.error('Missing tools. Run:  npm i --no-save axe-core playwright');
  process.exit(2);
}

const WCAG = { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } };
const REPO = path.join(import.meta.dirname, '..');
const withApps = process.argv.includes('--apps');

/** Marketing site: every page, at phone and desktop width. */
const SITE = {
  name: 'landing',
  base: process.env.LANDING_URL || 'http://localhost:4173',
  widths: [390, 1280],
  routes: fs.readdirSync(path.join(REPO, 'apps/landing')).filter(f => f.endsWith('.html')).sort().map(f => '/' + f),
};

/** Consoles: real screens behind a real login. */
const APPS = [
  { name: 'admin-web', base: process.env.ADMIN_URL || 'http://localhost:5173', email: process.env.A11Y_ADMIN_EMAIL,
    routes: ['/login', '/', '/action-required', '/professionals', '/professionals/verification', '/relationships',
      '/relationships/assignment-queue', '/users', '/admin-system', '/admin-system/roles', '/admin-system/audit-logs',
      '/admin-system/privacy-requests', '/programs', '/commerce', '/commerce/plans', '/commerce/refunds', '/support',
      '/support/safety-escalations', '/growth', '/growth/influencers', '/growth/campaigns', '/growth/applications', '/analytics'] },
  { name: 'gym-portal', base: process.env.GYM_URL || 'http://localhost:5174', email: process.env.A11Y_GYM_EMAIL,
    routes: ['/login', '/', '/invite', '/equipment', '/help', '/partnership', '/support'] },
  { name: 'creator-portal', base: process.env.CREATOR_URL || 'http://localhost:5175', email: process.env.A11Y_CREATOR_EMAIL,
    routes: ['/login', '/', '/campaigns', '/referral-tools', '/commission', '/agreement', '/account'] },
];

const PASSWORD = process.env.A11Y_PASSWORD;

function report(label, violations) {
  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.id)) byRule.set(v.id, { ...v, routes: new Set(), total: 0 });
    const g = byRule.get(v.id);
    g.routes.add(v.route);
    g.total += v.count;
  }
  console.log(`\n### ${label}`);
  if (!byRule.size) { console.log('NO VIOLATIONS'); return 0; }
  for (const g of [...byRule.values()].sort((a, b) => b.total - a.total)) {
    console.log(`[${g.impact}] ${g.id} — ${g.help}`);
    console.log(`  ${g.total} nodes across ${g.routes.size}: ${[...g.routes].slice(0, 6).join(', ')}`);
    for (const n of g.nodes) console.log(`  · ${n.target}\n      ${n.html}\n      ${n.summary}`);
  }
  return byRule.size;
}

async function scan(page, base, routes) {
  const found = [];
  for (const r of routes) {
    await page.goto(base + r, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForTimeout(500);
    await page.addScriptTag({ content: axeSource });
    const res = await page.evaluate(w => window.axe.run(document, w), WCAG);
    for (const v of res.violations) {
      found.push({ route: r, id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
        nodes: v.nodes.slice(0, 2).map(n => ({ target: n.target.join(' '), html: (n.html || '').slice(0, 110),
          summary: (n.failureSummary || '').split('\n').filter(Boolean).slice(0, 2).join(' | ') })) });
    }
  }
  return found;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
let ruleCount = 0;

for (const width of SITE.widths) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  ruleCount += report(`${SITE.name} @${width}px (${SITE.routes.length} pages)`, await scan(await ctx.newPage(), SITE.base, SITE.routes));
  await ctx.close();
}

if (withApps) {
  if (!PASSWORD) {
    console.error('\n--apps needs A11Y_PASSWORD, plus A11Y_{ADMIN,GYM,CREATOR}_EMAIL for accounts that can log in.');
    process.exit(2);
  }
  for (const app of APPS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(app.base + '/login', { waitUntil: 'networkidle' }).catch(() => {});
    await page.fill('input[type="email"]', app.email || '').catch(() => {});
    await page.fill('input[type="password"]', PASSWORD).catch(() => {});
    await page.click('button[type="submit"]').catch(() => {});
    await page.waitForURL(u => !u.pathname.endsWith('/login'), { timeout: 15000 }).catch(() => {});
    const landed = new URL(page.url()).pathname;
    // Said out loud: a failed login silently turns a 23-route audit into
    // a one-route audit that reports "NO VIOLATIONS".
    const note = landed === '/login' ? '  ** LOGIN FAILED — only /login was audited **' : '';
    ruleCount += report(`${app.name} (${app.routes.length} routes)${note}`, await scan(page, app.base, app.routes));
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${ruleCount === 0 ? 'Clean.' : ruleCount + ' distinct rule(s) violated.'}`);
process.exit(ruleCount === 0 ? 0 : 1);
