import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
// Imported for its side effect: initialises i18next before React renders.
// Without this line every t() in the app returns the key it was given —
// the login screen shipped to production reading "login.email" and
// "LOGIN.SUPERADMINCONSOLE" because the catalogue was never loaded.
import "./i18n";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
