/*
 * W-M2 — "'Continue to FynroX' on invite / referral pages has no defined
 * destination. Installed app -> deep link with attribution; not installed
 * -> store with deferred deep link; pre-launch -> Early Access with
 * source prefilled."
 *
 * This resolves the code against the real API before promising anything.
 * That ordering matters: a page that sends someone into the app with a
 * dead code produces a signup with silently wrong attribution and a gym
 * that never sees the member they introduced. Journeys F2 and F3 both
 * break at exactly this step today.
 *
 * D6 is still open, so there is no deferred deep-link provider. The API
 * reports that honestly as `deferredDeepLinkSupported: false`, and this
 * page then tells visitors to enter the code in the app rather than
 * promising a hand-off that will not survive an install. Once a provider
 * is configured the same flag turns the promise on with no page change.
 *
 * Progressive enhancement, like main.js: with JS off the page still
 * renders its explanatory content and a working link to the download
 * page. Only the personalised heading and the code hand-off need this.
 */
(function () {
  "use strict";

  var isGym = document.getElementById("inviteTitle") !== null;
  var prefix = isGym ? "invite" : "referral";

  var titleEl = document.getElementById(prefix + "Title");
  var subtitleEl = document.getElementById(prefix + "Subtitle");
  var actionsEl = document.getElementById(prefix + "Actions");
  var continueEl = document.getElementById(prefix + "Continue");
  var unavailableEl = document.getElementById(prefix + "Unavailable");
  var detailEl = document.getElementById(prefix + "Detail");

  if (!titleEl) return;

  // The code can arrive as a path segment (fynrox.app/gym/HYD-001, which
  // the host rewrites to this page) or as a query parameter. Both are
  // accepted so a hand-typed or pasted link works either way.
  function readCode() {
    var params = new URLSearchParams(window.location.search);
    var fromQuery = params.get("code") || params.get("gym") || params.get("r");
    if (fromQuery) return fromQuery.trim();

    var segments = window.location.pathname.split("/").filter(Boolean);
    var marker = isGym ? "gym" : "r";
    var at = segments.indexOf(marker);
    if (at !== -1 && segments[at + 1]) return decodeURIComponent(segments[at + 1]);
    return "";
  }

  function apiBase() {
    // Same convention the portals use: an explicit global wins, else the
    // site's own origin (the API is served under /api on the merged site).
    return (window.FYNROX_API_BASE_URL || "/api").replace(/\/$/, "");
  }

  /*
   * Copy this file builds rather than the HTML. The English is the
   * second argument, so with no catalogue loaded — the default — each
   * call site behaves exactly as the string literal it replaced.
   *
   * Names are interpolated with a placeholder rather than concatenated:
   * "{name} invited you" can be reordered by a translator, "X" + " has
   * invited you" cannot.
   */
  function t(key, english) {
    return window.FynroxI18n ? window.FynroxI18n.t(key, english) : english;
  }

  function fill(template, token, value) {
    return template.split(token).join(value);
  }

  function showUnavailable() {
    titleEl.textContent = isGym
      ? t("invite.gymInactiveTitle", "This invite isn't active")
      : t("invite.creatorInactiveTitle", "This link isn't active");
    subtitleEl.textContent = isGym
      ? t("invite.gymInactiveBody", "You can still join FynroX on your own.")
      : t(
          "invite.creatorInactiveBody",
          "You can still join FynroX \u2014 it only affects how the creator is credited.",
        );
    if (unavailableEl) unavailableEl.hidden = false;
  }

  function showValid(data) {
    if (isGym) {
      titleEl.textContent = data.gymName
        ? fill(t("invite.gymTitle", "{gym} invited you to FynroX"), "{gym}", data.gymName)
        : t("invite.gymTitleFallback", "You've been invited to FynroX");
      subtitleEl.textContent = t(
        "invite.gymSubtitle",
        "Create your account and your training plan will be built around the equipment they actually have.",
      );
    } else {
      titleEl.textContent = data.creatorName
        ? fill(t("invite.creatorTitle", "{creator} sent you to FynroX"), "{creator}", data.creatorName)
        : t("invite.creatorTitleFallback", "Welcome to FynroX");
      subtitleEl.textContent = t(
        "invite.creatorSubtitle",
        "Training, nutrition and recovery, with an AI coach grounded in your own data.",
      );
    }

    if (detailEl) detailEl.hidden = false;
    if (actionsEl) actionsEl.hidden = false;

    if (continueEl) {
      // Carry the code to the download page so it can be shown for manual
      // entry. Not an app deep link: without a deferred provider (D6) a
      // link that opens the store loses the code entirely, and a visitor
      // who has to retype it needs to be able to read it.
      var code = readCode();
      continueEl.href = "download.html?code=" + encodeURIComponent(code);

      if (!data.deferredDeepLinkSupported) {
        var note = document.createElement("p");
        note.className = "hero__note";
        note.textContent = fill(
          t("invite.codeNote", "Your code is {code} \u2014 you'll enter it once in the app."),
          "{code}",
          code,
        );
        actionsEl.parentNode.appendChild(note);
      }
    }
  }

  var code = readCode();
  if (!code) {
    showUnavailable();
    return;
  }

  var path = isGym ? "/links/gym/" : "/links/r/";
  fetch(apiBase() + path + encodeURIComponent(code), { headers: { Accept: "application/json" } })
    .then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, body: body };
      });
    })
    .then(function (result) {
      if (result.ok && result.body && result.body.valid) showValid(result.body);
      else showUnavailable();
    })
    .catch(function () {
      // A network failure is not the same as a dead link, and telling
      // someone their gym's invite has expired when the API is simply
      // unreachable would be a lie with consequences for the gym.
      titleEl.textContent = t("invite.errorTitle", "We couldn't check your invite");
      subtitleEl.textContent = t(
        "invite.errorBody",
        "Something went wrong on our side, not yours. You can still continue and enter your code in the app.",
      );
      if (actionsEl) actionsEl.hidden = false;
    });
})();
