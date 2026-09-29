/*
 * FynroX landing page — small progressive-enhancement script.
 *
 * Nothing here is required for the page to work: with JS disabled the page
 * is still fully readable and navigable (all content is in the HTML, all
 * links are real anchors, nothing is hidden pending a script). This only
 * adds two small, safe touches:
 *   1. A background/shadow on the sticky header once the page is scrolled.
 *   2. The footer copyright year, computed instead of hand-maintained.
 *
 * An earlier version of this file also added a scroll-triggered fade-in for
 * each section via IntersectionObserver, hiding content (opacity: 0) until
 * it scrolled into view. Removed after testing showed a real failure mode:
 * a fast scroll (a phone fling, or jumping to the page bottom) can move an
 * element through the viewport faster than the browser batches
 * intersection checks, so the observer never fires for it and the element
 * stays invisible — permanently, since nothing else ever sets its opacity
 * back to 1. Permanently invisible content is a worse outcome than skipping
 * a fade-in animation, so the mechanism was removed rather than patched.
 */
(function () {
  "use strict";

  var header = document.getElementById("siteHeader");

  function updateHeaderState() {
    if (!header) return;
    if (window.scrollY > 8) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  }

  window.addEventListener("scroll", updateHeaderState, { passive: true });
  updateHeaderState();

  /*
   * The year sits inside a translated sentence ("© <span id="year">
   * FynroX. Not a substitute..."), so swapping that sentence replaces
   * this span with the empty one from the catalogue. Writing the year
   * again on `fynrox:i18n` is the contract assets/js/i18n.js documents
   * for anything that puts text into the DOM.
   */
  function setYear() {
    var yearEl = document.getElementById("year");
    if (yearEl) {
      yearEl.textContent = String(new Date().getFullYear());
    }
  }

  setYear();
  document.addEventListener("fynrox:i18n", setYear);

  /*
   * Mobile navigation (spec §8). The nav used to be one flat row that
   * wrapped onto three lines on a phone; below 900px the stylesheet now
   * collapses it behind this toggle.
   *
   * The button is rendered with `hidden` in the HTML and un-hidden here,
   * which is the honest order: with JS off the toggle could never open
   * anything, and a button that does nothing is worse than no button.
   * The CSS only hides the nav inside the same breakpoint, so the
   * no-JS page keeps its full (wrapped) nav rather than losing it.
   */
  var toggle = document.getElementById("navToggle");
  var nav = document.getElementById("primaryNav");
  if (toggle && nav) {
    document.documentElement.classList.add("has-nav-toggle");
    toggle.hidden = false;

    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    // Escape closes it and returns focus, so a keyboard user is not
    // trapped scrolling a panel they cannot dismiss.
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !nav.classList.contains("is-open")) return;
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    });
  }
})();
