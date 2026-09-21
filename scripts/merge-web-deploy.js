#!/usr/bin/env node
/**
 * Go-live hardening (4 Sep 2026) — combines two independently-built static
 * sites into one deployable folder for a single Azure Static Web App:
 *   - apps/landing (plain static HTML/CSS/JS, no build step) at the site
 *     ROOT — this is what visitors see first. Its own "Download the app"
 *     section is the consumer path (Android APK).
 *   - a second app's already-built dist/ folder under /app/ — a login
 *     console reachable via a link on the landing page. Generalized 4 Sep
 *     2026 (same day, a few hours later) to take that app's dist path as
 *     an argument rather than hardcoding one: it merged with
 *     apps/user-mobile first, then apps/coach-mobile, then this site
 *     itself moved from being coach-mobile's to being admin-web's — see
 *     each deploy workflow's own comment for which app is merged where
 *     and why, since that decision has moved more than once and belongs
 *     there, not duplicated in every version of this comment.
 *
 * Why this is safe to flatten together rather than needing real subpath
 * config on the second app's own build: both Vite (admin-web) and Expo's
 * web export (coach-mobile) already reference their own assets via
 * root-absolute paths (Vite's `/assets/...`, Expo's `/_expo/...` +
 * `/assets/...`), which resolve correctly from the domain root regardless
 * of what page requested them — so that app's own asset folders can sit
 * at the combined site's root exactly as they already do standalone; only
 * its index.html needs to move to a real /app/index.html so it doesn't
 * collide with the landing page's own root index.html. The one thing that
 * does need checking on each run (this script does it) is whether
 * apps/landing's own assets/ folder and the other app's assets/ folder
 * ever collide on an actual filename — see the check below. Confirmed
 * clean for both apps tried so far: landing's are subfoldered
 * (assets/css/*, assets/js/*, assets/favicon.svg), Vite's and Expo's are
 * both flat/hashed or namespaced differently (assets/index-<hash>.{js,css}
 * for Vite, assets/__node_modules/* for Expo).
 *
 * 21 Sep 2026 — extended to also mount any number of FURTHER apps, each at
 * its own subpath, for the Gym Partner and Creator portals. Those are added
 * in a different mode from the one described above, deliberately:
 *
 *   - The app in the second argument keeps the original "flatten" mode —
 *     its assets go to the site root and only its index.html moves to
 *     /app/index.html. That is how admin-web is already built and deployed,
 *     and this pass did not want to change the asset URLs of a console that
 *     is live and working.
 *   - Every app after it is mounted "self-contained": its whole dist/ is
 *     copied under /<mount>/ untouched. Those apps are built with Vite's
 *     `--base=/<mount>/`, so their own HTML already points at
 *     /<mount>/assets/... and nothing of theirs ever reaches the root.
 *
 * Self-contained is the better mode and the one to prefer for anything new:
 * with three or more Vite apps the flatten mode would pile every app's
 * assets into one shared root assets/ folder, where the only thing keeping
 * them apart is Vite's content hashes. That works, but it makes an
 * accidental collision a build-time failure rather than something the layout
 * rules out by construction.
 *
 * Run from the repo root:
 *   node scripts/merge-web-deploy.js <outputDir> <appDistDir> [<dist>:<mount> ...]
 *
 * appDistDir and each <dist> are relative to the repo root, e.g.
 *   node scripts/merge-web-deploy.js combined-web-deploy apps/admin-web/dist \
 *     apps/gym-portal/dist:gym apps/creator-portal/dist:creator
 */
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const landingDir = path.join(repoRoot, "apps/landing");
const outputDir = path.resolve(repoRoot, process.argv[2] || "combined-web-deploy");
const appDistArg = process.argv[3];
if (!appDistArg) {
  console.error("Usage: node scripts/merge-web-deploy.js <outputDir> <appDistDir> [<dist>:<mount> ...]");
  console.error("  appDistDir example: apps/admin-web/dist");
  console.error("  extra app example:  apps/gym-portal/dist:gym");
  process.exit(1);
}
const appDistDir = path.resolve(repoRoot, appDistArg);

// Everything after the second app is "<dist>:<mount>" — mounted whole, under
// its own subpath. Parsed strictly rather than forgivingly: a typo here would
// otherwise deploy a portal to the wrong path, or to the site root on top of
// the landing page, and only be noticed in production.
const extraApps = process.argv.slice(4).map((arg) => {
  const sep = arg.lastIndexOf(":");
  if (sep <= 0 || sep === arg.length - 1) {
    console.error(`Bad extra-app argument "${arg}" — expected "<dist>:<mount>", e.g. apps/gym-portal/dist:gym`);
    process.exit(1);
  }
  const dist = arg.slice(0, sep);
  const mount = arg.slice(sep + 1).replace(/^\/+|\/+$/g, "");
  // Multi-segment mounts are allowed ("portal/gym"), because the marketing
  // site already links to the portals at /portal/gym/login and
  // /portal/creator/login — the deploy matches those existing links rather
  // than inventing shorter paths and leaving the site's own CTAs 404ing.
  // Still rejected: empty segments, "." and "..", and anything that would
  // escape the output directory.
  if (!mount || !/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)*$/i.test(mount)) {
    console.error(
      `Bad mount "${arg.slice(sep + 1)}" in "${arg}" — expected one or more path segments, e.g. gym or portal/gym`,
    );
    process.exit(1);
  }
  return { distArg: dist, dist: path.resolve(repoRoot, dist), mount };
});

// "app" is taken by the flatten-mode app below, and two apps claiming one
// mount would silently overwrite each other.
const seenMounts = new Set(["app"]);
for (const { mount, distArg } of extraApps) {
  if (seenMounts.has(mount)) {
    console.error(`Mount "/${mount}/" is claimed twice (second time by ${distArg}).`);
    process.exit(1);
  }
  seenMounts.add(mount);
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Merge src's contents into dest, erroring loudly on any file that would
// silently overwrite an existing one — a real collision here is a bug
// worth stopping the build for, not papering over.
function mergeRecursive(src, dest, relPath = "") {
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    const entryRel = relPath ? `${relPath}/${entry}` : entry;
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      mergeRecursive(srcPath, destPath, entryRel);
    } else {
      if (fs.existsSync(destPath)) {
        throw new Error(
          `Refusing to overwrite: ${entryRel} exists in both apps/landing and ${appDistArg}. ` +
            `Rename one side to resolve the collision — this script deliberately fails loudly instead of silently picking one.`,
        );
      }
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(appDistDir)) {
  console.error(`Missing ${appDistDir} — build that app first.`);
  process.exit(1);
}
for (const { dist, distArg } of extraApps) {
  if (!fs.existsSync(dist)) {
    console.error(`Missing ${distArg} — build that app first.`);
    process.exit(1);
  }
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

// 1. Landing page at the root — everything except its own dev-only files
//    (package.json/serve.js/README.md aren't meant to be served) and its
//    own staticwebapp.config.json, which this script replaces below with
//    one that also knows about /app/.
const landingSkip = new Set(["package.json", "serve.js", "README.md", "staticwebapp.config.json", "node_modules"]);
for (const entry of fs.readdirSync(landingDir)) {
  if (landingSkip.has(entry)) continue;
  copyRecursive(path.join(landingDir, entry), path.join(outputDir, entry));
}

// 2. The other app's own supporting files land at the SAME root — safe
//    because that app's own HTML references them via root-absolute paths.
//    Copy every top-level entry from its dist/ EXCEPT index.html (moved
//    below) and its own staticwebapp.config.json (this script writes a
//    combined one instead) — generic over whatever that app's build
//    happens to produce (Vite's assets/, Expo's _expo/ + assets/ +
//    metadata.json, or anything else), rather than hardcoding folder
//    names tied to one specific app.
const appDistSkip = new Set(["index.html", "staticwebapp.config.json"]);
for (const entry of fs.readdirSync(appDistDir)) {
  if (appDistSkip.has(entry)) continue;
  const srcPath = path.join(appDistDir, entry);
  const destPath = path.join(outputDir, entry);
  if (fs.existsSync(destPath)) {
    // Both sides have a top-level entry with this name (e.g. both have an
    // assets/ folder) — merge their contents instead of a flat copy, so a
    // real per-file collision still throws instead of one side silently
    // replacing the other's whole folder.
    mergeRecursive(srcPath, destPath, entry);
  } else {
    copyRecursive(srcPath, destPath);
  }
}

// 3. The other app's own index.html moves to /app/index.html — this is
//    the ONE file that would otherwise collide with landing's own root
//    index.html.
fs.mkdirSync(path.join(outputDir, "app"), { recursive: true });
fs.copyFileSync(path.join(appDistDir, "index.html"), path.join(outputDir, "app", "index.html"));

// 3b. Each further app is copied under its own /<mount>/ wholesale — assets
//     and all. Nothing of theirs touches the root, so unlike step 2 there is
//     no collision to check for: they were built with --base=/<mount>/ and
//     reference their own files from inside that folder.
for (const { dist, mount } of extraApps) {
  copyRecursive(dist, path.join(outputDir, mount));
  // Their own staticwebapp.config.json, if any, would be dead weight nested
  // under a subpath — Azure only reads the one at the deploy root, written
  // below — and leaving it there implies it does something.
  fs.rmSync(path.join(outputDir, mount, "staticwebapp.config.json"), { force: true });
}

// 4. Combined routing config — /app/* always serves the other app's own
//    index.html (so its client-side routing survives a refresh deep
//    inside it); everything else that isn't a real file falls back to the
//    landing page. Each mounted app gets the same treatment at its own
//    subpath, for the same reason: they are single-page apps, so a refresh
//    on an inner route has to return that app's index.html rather than a
//    404 or the landing page.
fs.writeFileSync(
  path.join(outputDir, "staticwebapp.config.json"),
  JSON.stringify(
    {
      // Two entries, not three — Azure's own config validation rejects
      // the deploy outright ("duplicate route /app/") if both "/app/" and
      // "/app/*" are listed: the wildcard already covers the trailing-
      // slash case internally. "/app" (no slash) is a distinct literal
      // route Azure does NOT fold into the wildcard, so it still needs
      // its own entry.
      routes: [
        { route: "/app", rewrite: "/app/index.html" },
        { route: "/app/*", rewrite: "/app/index.html" },
        // Order matters: Azure matches these top to bottom and applies the
        // first hit, so each app's assets/ must be claimed BEFORE its
        // catch-all wildcard. Without this line "/gym/*" also matches
        // "/gym/assets/index-<hash>.js" and rewrites it to index.html —
        // the browser then gets HTML where it asked for JavaScript and the
        // portal renders blank. This does not arise for /app/ above,
        // because that app's assets live at the site root (see step 2), not
        // under its mount — which is exactly why it has no such rule and
        // why copying its two-route shape here would have been wrong.
        //
        // A rule with only `headers` does not rewrite, so the real file is
        // served; the immutable cache header is safe because every one of
        // these filenames is content-hashed by Vite.
        ...extraApps.flatMap(({ mount }) => [
          {
            route: `/${mount}/assets/*`,
            headers: { "Cache-Control": "public, max-age=31536000, immutable" },
          },
          { route: `/${mount}`, rewrite: `/${mount}/index.html` },
          { route: `/${mount}/*`, rewrite: `/${mount}/index.html` },
        ]),
      ],
      navigationFallback: {
        rewrite: "/index.html",
        exclude: [
          "/app/*",
          ...extraApps.map(({ mount }) => `/${mount}/*`),
          "/_expo/*",
          "/assets/*",
          "/favicon.svg",
          "/robots.txt",
        ],
      },
      globalHeaders: {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
      mimeTypes: {
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
      },
    },
    null,
    2,
  ) + "\n",
);

const mounted = [`${appDistArg} at /app/`, ...extraApps.map(({ distArg, mount }) => `${distArg} at /${mount}/`)];
console.log(`Combined web deploy written to ${outputDir}:`);
console.log(`  landing at /`);
for (const m of mounted) console.log(`  ${m}`);
