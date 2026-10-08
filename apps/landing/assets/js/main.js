/*
 * Fynrox landing page — small progressive-enhancement script.
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
 *
 * A reveal came back on 3 Oct 2026 with the light theme, deliberately NOT
 * built on IntersectionObserver, because that bug is a property of the
 * observer and not of the idea. This one sweeps the remaining elements
 * with getBoundingClientRect inside a rAF-throttled scroll handler: a
 * fling cannot outrun it, because the very next frame still sees the
 * element sitting above the viewport and reveals it. On top of that a
 * timer reveals everything unconditionally shortly after load, so even a
 * thrown exception or a browser that never fires `scroll` ends with the
 * page fully visible. Three independent paths to visible, one to hidden.
 *
 * It also loads the hero video, which is 7.6 MB and therefore opt-in by
 * capability rather than a cost every phone pays. See attachHeroVideo.
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
   * Fynrox. Not a substitute..."), so swapping that sentence replaces
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

  /*
   * Reveal-on-scroll.
   *
   * `pending` shrinks as elements are revealed and the handlers detach
   * once it is empty, so this costs nothing after the first screenful or
   * two. Reading every rect in one pass before writing any class keeps
   * the browser from interleaving layout and style work per element.
   */
  var pending = [].slice.call(document.querySelectorAll(".reveal, .reveal--stagger"));

  function revealAll() {
    for (var i = 0; i < pending.length; i++) pending[i].classList.add("is-in");
    pending = [];
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  }

  function sweep() {
    frame = 0;
    if (!pending.length) return;
    // Anything whose top has reached the lower 12% of the viewport, or
    // which has already gone past the top, is due. The second half is
    // what makes a fling safe.
    var limit = window.innerHeight * 0.88;
    var due = [];
    var rest = [];
    for (var i = 0; i < pending.length; i++) {
      var box = pending[i].getBoundingClientRect();
      if (box.top < limit) due.push(pending[i]);
      else rest.push(pending[i]);
    }
    pending = rest;
    for (var j = 0; j < due.length; j++) due[j].classList.add("is-in");
    if (!pending.length) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    }
  }

  var frame = 0;
  function onScroll() {
    if (frame) return;
    frame = window.requestAnimationFrame(sweep);
  }

  if (pending.length) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    sweep();
    // The backstop. Whatever else happens — an exception above, a
    // browser that batches scroll oddly, a page restored from bfcache
    // mid-scroll — the page is fully visible 2.5s after load.
    window.setTimeout(revealAll, 2500);
  }

  /*
   * The hero video.
   *
   * 7.6 MB is a real cost, and on a phone on mobile data it buys an
   * ambient loop the visitor did not ask for. So the <video> ships with
   * no source and the poster image carries the hero on its own; a source
   * is attached only when all of these hold:
   *
   *   - the viewport is wide enough for the media panel to be more than
   *     a thin strip,
   *   - the visitor has not asked for reduced motion (an autoplaying
   *     loop is motion, not merely decoration),
   *   - the browser does not report Save-Data or a slow effective
   *     connection type.
   *
   * Network Information API support is patchy; absence is treated as
   * "no objection" rather than as a reason to skip, so the video still
   * plays in Safari and Firefox.
   */
  function attachHeroVideo() {
    var video = document.querySelector(".hero__media video");
    if (!video || video.getAttribute("src")) return;

    var src = video.getAttribute("data-src");
    if (!src) return;

    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 900) return;

    var net = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (net) {
      if (net.saveData) return;
      if (/^(slow-2g|2g|3g)$/.test(net.effectiveType || "")) return;
    }

    video.addEventListener("canplay", function () {
      video.classList.add("is-playing");
    });
    video.src = src;
    var started = video.play();
    // Autoplay can still be refused (a browser policy, a battery-saver
    // mode). The poster is already showing, so there is nothing to undo
    // beyond not promoting the video above it.
    if (started && typeof started.catch === "function") {
      started.catch(function () {
        video.classList.remove("is-playing");
      });
    }
  }

  attachHeroVideo();
})();
