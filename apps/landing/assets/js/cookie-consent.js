/*
 * W-M3 — "No cookie consent banner, only a notice page. Banner with
 * Accept / Reject non-essential; required once analytics or attribution
 * cookies run."
 *
 * The conditional in that requirement is the important part, and it is
 * why this file does more than render a bar: rejecting has to actually
 * stop something, or the banner is theatre. So consent gates a real
 * global flag that any analytics or attribution script must check, and
 * nothing that would set a non-essential cookie runs before a choice is
 * made.
 *
 * The choice itself is stored in localStorage rather than a cookie,
 * deliberately: a cookie recording that you refused cookies is a poor
 * look and a pointless one, since this preference never needs to reach
 * the server.
 */
(function () {
  "use strict";

  var STORAGE_KEY = "fynrox.cookieConsent";
  var ACCEPTED = "accepted";
  var REJECTED = "rejected";

  function read() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      // Private mode, blocked storage, or a browser that throws on
      // access. Treated as "no choice made", which fails closed: nothing
      // non-essential runs.
      return null;
    }
  }

  function write(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch (err) {
      /* Nothing to do — the page still works, we just ask again later. */
    }
  }

  // The flag every analytics/attribution script must consult. Set before
  // the banner renders so a script loading in parallel cannot race it.
  window.fynroxConsent = {
    nonEssentialAllowed: read() === ACCEPTED,
  };

  if (read() !== null) return; // already decided

  /*
   * Copy this file builds rather than the HTML. The English is the
   * second argument, so with no catalogue loaded — the default — each
   * call site behaves exactly as the string literal it replaced.
   */
  function t(key, english) {
    return window.FynroxI18n ? window.FynroxI18n.t(key, english) : english;
  }

  function render() {
    var bar = document.createElement("div");
    bar.className = "cookie-bar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", t("cookies.ariaLabel", "Cookie choices"));
    bar.innerHTML =
      '<div class="wrap cookie-bar__inner">' +
      '<p class="cookie-bar__text">' +
      // One string, markup and all: the link sits mid-sentence and a
      // translation has to be free to move it.
      t(
        "cookies.text",
        "We use essential cookies to make this site work. With your permission we’d also " +
          "use analytics and attribution cookies, which tell us how people found us. You can say no and everything still works. " +
          '<a href="/privacy.html">How we handle your data</a>.',
      ) +
      "</p>" +
      '<div class="cookie-bar__actions">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-consent="reject">' +
      t("cookies.reject", "Reject non-essential") +
      "</button>" +
      '<button type="button" class="btn btn--primary btn--sm" data-consent="accept">' +
      t("cookies.accept", "Accept") +
      "</button>" +
      "</div></div>";

    bar.addEventListener("click", function (event) {
      var choice = event.target.getAttribute && event.target.getAttribute("data-consent");
      if (!choice) return;
      var value = choice === "accept" ? ACCEPTED : REJECTED;
      write(value);
      window.fynroxConsent.nonEssentialAllowed = value === ACCEPTED;
      bar.remove();
      // Announced so a script that loaded before a choice was made can
      // start (or stay stopped) without polling.
      document.dispatchEvent(new CustomEvent("fynrox:consent", { detail: { value: value } }));
    });

    document.body.appendChild(bar);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
