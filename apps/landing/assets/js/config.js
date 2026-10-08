/*
 * Where this site's scripts look for the API.
 *
 * This file exists because apps/landing deliberately has no build step
 * (see README.md), and that had a consequence nobody had tripped over
 * until the site went live: admin-web and both partner portals get an
 * absolute API URL compiled in through Vite's `VITE_API_BASE_URL`, but
 * a folder of static HTML has no compile step to inject anything into.
 *
 * So forms.js and invite.js fell back to a same-origin "/api", and the
 * Static Web App has no route for "/api" and no linked backend. Every
 * form on the site — Early Access, contact, and the gym, creator and
 * professional applications — and both invite landings were posting
 * into a 404. They failed honestly (the pages say "We couldn't reach
 * Fynrox" rather than pretending to succeed), which is exactly why it
 * could survive a casual look at the deployed site.
 *
 * The value below is the local-development default, matching what the
 * portals use when VITE_API_BASE_URL is unset. The deploy workflow
 * (.github/workflows/azure-static-web-apps-purple-sea-0edcdc910.yml)
 * overwrites this one file in the built output with the real origin
 * from the API_BASE_URL secret, and fails the build if that secret is
 * empty rather than shipping a site pointing at localhost.
 *
 * Loaded before every other script on every page. It assigns a global
 * and touches no DOM, so it is safe anywhere in the document.
 */
window.FYNROX_API_BASE_URL = "http://localhost:4000";
