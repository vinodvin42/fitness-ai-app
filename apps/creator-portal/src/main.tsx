import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";

// This portal is served from a subpath (/creator/) on the combined static
// site, not from its own domain root — see scripts/merge-web-deploy.js. Vite's
// `--base` already rewrites asset URLs for that, but the router needs telling
// separately, or every route would be matched against "/creator/..." and miss.
//
// Deriving the basename from BASE_URL rather than hardcoding "/creator" keeps
// the two from drifting: whatever `--base` the build used is what the router
// uses. In dev, where no `--base` is passed, BASE_URL is "/" and this is a
// no-op. React Router normalises the trailing slash Vite leaves on BASE_URL.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
