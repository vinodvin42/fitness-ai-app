import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/ — own port (5174), distinct from admin-web's 5173
// so both can run side by side locally.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Where this portal is served from. Defaults to the domain root, which is
  // what `npm run dev` wants; the combined static-site build sets it to
  // "/gym/" because that deploy serves the landing page at the root and each
  // portal under a subpath (see scripts/merge-web-deploy.js).
  //
  // PORTAL_BASE holds a BARE SEGMENT ("gym"), not a path, and deliberately
  // not `vite build --base=/gym/`. Git Bash's MSYS path translation rewrites
  // anything shaped like an absolute path — in a CLI argument AND in an env
  // var value — so both `--base=/gym/` and `PORTAL_BASE=/gym/` arrive as
  // "/Program Files/Git/gym/" on the Windows machine this repo is developed
  // on. Verified by hand, both forms. A bare word is never translated, so
  // this behaves identically in Git Bash, PowerShell and CI. The same class
  // of bug already bit the Static Web Apps workflows once — see their
  // app_location comments.
  //
  // src/main.tsx reads the resulting value back via import.meta.env.BASE_URL
  // for the router's basename, so the two cannot drift.
  base: process.env.PORTAL_BASE ? `/${process.env.PORTAL_BASE}/` : "/",
  server: {
    port: 5174,
  },
});
