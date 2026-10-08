/**
 * Zero-dependency static file server for local preview only.
 * Not used in production — Azure Static Web Apps serves this folder
 * directly (see staticwebapp.config.json). Node core modules only, so
 * `npm run dev --workspace=apps/landing` works with no install step.
 *
 * Usage:  node serve.js            (defaults to http://localhost:4173)
 *         PORT=8080 node serve.js  (custom port)
 */
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = __dirname;
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".webmanifest": "application/manifest+json",
  // Added with the site's photography and self-hosted fonts. Without an
  // entry here the fallback type made Chrome refuse the video outright
  // and treat the woff2 files as something it would not use as a font,
  // so a local preview silently lost both — the one thing this server
  // exists to show faithfully.
  ".mp4": "video/mp4",
  ".woff2": "font/woff2",
};

/*
 * Mirrors staticwebapp.config.json's `routes`, so a local run resolves
 * the invite and referral links the same way production does. Without
 * this, /gym/ABC123 works on the deployed site and 404s (or silently
 * renders the home page) locally — which is exactly the class of
 * difference that gets noticed after launch.
 */
function rewriteRoute(requestedPath) {
  if (requestedPath === "/") return "/index.html";
  if (requestedPath.startsWith("/gym/")) return "/gym-invite.html";
  if (requestedPath.startsWith("/r/")) return "/referral.html";
  return requestedPath;
}

const server = http.createServer((req, res) => {
  const requestedPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const relativePath = rewriteRoute(requestedPath);
  const filePath = path.normalize(path.join(ROOT, relativePath));

  // Guard against path traversal outside this folder.
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // A request that names a file gets a plain 404, never the HTML
      // fallback — mirroring staticwebapp.config.json's
      // `navigationFallback.exclude`, which keeps /assets/* out of the
      // rewrite.
      //
      // This matters more than it looks. Until 3 Oct 2026 every page
      // referenced its CSS as `assets/css/styles.css`, relative. At a
      // nested URL — /gym/{code} and /r/{code} are real partner links,
      // and any deep path hits the fallback — that resolves to
      // /gym/assets/css/styles.css, which does not exist. Azure answered
      // with 404.html, and a browser will not apply text/html as a
      // stylesheet, so those pages rendered as naked serif HTML in
      // production. This server answered the same request with 200 and
      // the HTML fallback, so a local check looked fine and the bug
      // shipped. Now the local server fails the same way Azure does.
      if (path.extname(filePath) && path.extname(filePath) !== ".html") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }
      fs.readFile(path.join(ROOT, "404.html"), (fallbackErr, fallbackData) => {
        if (fallbackErr) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fallbackData);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Fynrox landing page → http://localhost:${PORT}`);
});
