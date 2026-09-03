/*
 * 23PrimeFit landing page — small progressive-enhancement script.
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

  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
