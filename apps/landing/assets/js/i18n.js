/*
 * FynroX landing page — runtime translation.
 *
 * The rest of the product translates with i18next. This site cannot:
 * it has no build step and no framework (see README.md), and adding
 * either to ship copy would cost more than the copy is worth. So the
 * same job is done with the two things a static page does have — an
 * attribute on the element and a script at the end of the body.
 *
 * How it works
 * ------------
 *   <h1 data-i18n="index.heroTitle">Training, nutrition, ...</h1>
 *   <p  data-i18n-html="faq.answer">Yes, and <a href="x">here's why</a>.</p>
 *   <meta data-i18n-attr="content:index.metaDescription" ... />
 *
 * English lives in the HTML, not in a catalogue. That is the whole
 * design decision and it buys three things:
 *
 *   1. With JavaScript off, or before this file runs, the page is
 *      complete and correct English rather than a flash of empty
 *      elements or a grid of raw keys.
 *   2. Search engines index the English page as written. Nothing here
 *      changes what a crawler sees.
 *   3. A missing translation key is invisible: the element keeps the
 *      English already in it. Compare i18next, which renders the key
 *      itself — `faq.answer.title` as body copy on a public page.
 *
 * What it costs, stated plainly: every language shares one URL, so
 * only the English page is indexable. Per-language URLs would need
 * pre-rendering, which needs a build step. The extraction done here is
 * the expensive half and it is not wasted — a future generator reads
 * the same attributes and the same catalogues.
 *
 * Adding a language
 * -----------------
 *   1. Copy assets/i18n/en.js to assets/i18n/<code>.js, translate the
 *      values, leave the keys alone.
 *   2. Add `{ code: "<code>", label: "<endonym>" }` to LANGUAGES below.
 * The picker appears by itself once there is more than one language —
 * a picker offering languages that do not exist is worse than none.
 */
(function (window, document) {
  "use strict";

  var STORAGE_KEY = "fynrox.lang";
  var DEFAULT_LANG = "en";

  /*
   * Only languages with a catalogue file on disk. The app supports ten
   * Indian languages and only `en` is populated there either; this list
   * grows when a catalogue is actually written, not when a language is
   * aspired to.
   */
  var LANGUAGES = [{ code: "en", label: "English" }];

  window.FYNROX_I18N = window.FYNROX_I18N || {};

  /* ---------------------------------------------------------------- */

  function codes() {
    return LANGUAGES.map(function (l) { return l.code; });
  }

  function stored() {
    try {
      var v = window.localStorage.getItem(STORAGE_KEY);
      return codes().indexOf(v) >= 0 ? v : null;
    } catch (err) {
      // Safari in private mode throws on localStorage. A language
      // preference is not worth an exception on every page load.
      return null;
    }
  }

  function remember(code) {
    try {
      window.localStorage.setItem(STORAGE_KEY, code);
    } catch (err) {
      /* see stored() */
    }
  }

  /*
   * The English in the page is the English catalogue as far as the
   * runtime is concerned, so it is captured before anything is
   * overwritten. Switching back to English then restores exactly what
   * was authored, including markup and whitespace, rather than a
   * round-trip through a catalogue that might have drifted.
   */
  var originals = null;

  function captureOriginals() {
    if (originals) return originals;
    originals = [];
    var nodes = document.querySelectorAll("[data-i18n], [data-i18n-html], [data-i18n-attr]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var entry = { el: el, attrs: {} };
      if (el.hasAttribute("data-i18n")) entry.text = el.textContent;
      if (el.hasAttribute("data-i18n-html")) entry.html = el.innerHTML;
      var attrSpec = el.getAttribute("data-i18n-attr");
      if (attrSpec) {
        var pairs = attrSpec.split(";");
        for (var j = 0; j < pairs.length; j++) {
          var name = pairs[j].split(":")[0];
          if (name) entry.attrs[name] = el.getAttribute(name);
        }
      }
      originals.push(entry);
    }
    return originals;
  }

  /**
   * Applies a dictionary, or restores the authored English when given
   * null. A key the dictionary does not carry is left alone, so a
   * half-translated catalogue shows English for the rest instead of a
   * hole.
   */
  function apply(dict) {
    var entries = captureOriginals();
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var el = e.el;

      if ("text" in e) {
        var k = el.getAttribute("data-i18n");
        el.textContent = dict && dict[k] != null ? dict[k] : e.text;
      }
      if ("html" in e) {
        var kh = el.getAttribute("data-i18n-html");
        // The catalogue is a file in this repository, not user input;
        // the markup inside a sentence ("read the <a>terms</a>") has to
        // survive translation, and splitting it into fragments is how
        // translations end up with English word order welded in.
        el.innerHTML = dict && dict[kh] != null ? dict[kh] : e.html;
      }
      var attrSpec = el.getAttribute("data-i18n-attr");
      if (attrSpec) {
        var pairs = attrSpec.split(";");
        for (var j = 0; j < pairs.length; j++) {
          var bits = pairs[j].split(":");
          var name = bits[0];
          var key = bits.slice(1).join(":");
          if (!name) continue;
          var value = dict && dict[key] != null ? dict[key] : e.attrs[name];
          if (value == null) el.removeAttribute(name);
          else el.setAttribute(name, value);
        }
      }
    }
  }

  var current = DEFAULT_LANG;

  /**
   * Copy that JavaScript builds rather than the HTML. The English is
   * passed in as the fallback, so with no catalogue loaded — the
   * default, and every catalogue-failed-to-load case — these call sites
   * behave exactly as the string literals they replaced.
   */
  function t(key, english) {
    var dict = window.FYNROX_I18N[current];
    return dict && dict[key] != null ? dict[key] : english;
  }

  function loadCatalogue(code, done) {
    if (window.FYNROX_I18N[code]) return done(window.FYNROX_I18N[code]);
    var s = document.createElement("script");
    s.src = "assets/i18n/" + code + ".js";
    s.onload = function () { done(window.FYNROX_I18N[code] || null); };
    // A catalogue that will not load must leave the page in English,
    // not half-swapped and not blank.
    s.onerror = function () { done(null); };
    document.head.appendChild(s);
  }

  /*
   * Pseudo-localisation: `?pseudo=1` renders every catalogued string
   * accented. It is a test, not a language, so it is not in the picker
   * — its job is to make an un-extracted string obvious, because
   * anything still in plain English on that page is a string this file
   * cannot reach.
   */
  var PSEUDO_MAP = { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" };

  function pseudoise(value) {
    /*
     * Only the text between the tags. An earlier version matched
     * everything that was not an angle bracket, which happily rewrote
     * `<span id="year">` to `<spán íd="yéár">` — the attribute name
     * changed, the element stopped being findable, and the footer year
     * silently vanished. Entities are skipped for the same reason:
     * `&ámp;` is not an entity.
     */
    return value.replace(/<[^>]*>|[^<]+/g, function (chunk) {
      if (chunk.charAt(0) === "<") return chunk;
      return chunk.replace(/&[#\w]+;|[aeiouAEIOU]/g, function (c) {
        return c.length > 1 ? c : PSEUDO_MAP[c];
      });
    });
  }

  function pseudoDict(en) {
    var out = {};
    for (var k in en) if (Object.prototype.hasOwnProperty.call(en, k)) out[k] = pseudoise(en[k]);
    return out;
  }

  function announce() {
    // Anything that writes text into the DOM after load (the footer
    // year, the carried referral code) has to write it again once the
    // markup around it has been replaced. Listening for this is the
    // contract; see README.md.
    document.dispatchEvent(new CustomEvent("fynrox:i18n"));
  }

  function setLanguage(code, persist) {
    if (codes().indexOf(code) < 0) code = DEFAULT_LANG;
    if (persist) remember(code);
    if (code === DEFAULT_LANG) {
      current = DEFAULT_LANG;
      apply(null);
      document.documentElement.setAttribute("lang", DEFAULT_LANG);
      renderPicker();
      announce();
      return;
    }
    loadCatalogue(code, function (dict) {
      current = dict ? code : DEFAULT_LANG;
      apply(dict);
      document.documentElement.setAttribute("lang", current);
      renderPicker();
      announce();
    });
  }

  /* ---------------------------------------------------------------- */

  function renderPicker() {
    var host = document.querySelector("[data-i18n-picker]");
    if (!host) return;
    if (LANGUAGES.length < 2) {
      // Nothing to choose between. Rendering a one-option select would
      // be a control that cannot do anything.
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var existing = host.querySelector("select");
    if (existing) {
      existing.value = current;
      return;
    }

    var label = document.createElement("label");
    label.className = "footer__lang-label";
    label.setAttribute("for", "langPicker");
    label.textContent = t("shell.language", "Language");

    var select = document.createElement("select");
    select.className = "footer__lang";
    select.id = "langPicker";
    for (var i = 0; i < LANGUAGES.length; i++) {
      var opt = document.createElement("option");
      opt.value = LANGUAGES[i].code;
      // The endonym, deliberately: a speaker looking for their own
      // language scans for it written the way they write it.
      opt.textContent = LANGUAGES[i].label;
      select.appendChild(opt);
    }
    select.value = current;
    select.addEventListener("change", function () { setLanguage(select.value, true); });

    host.appendChild(label);
    host.appendChild(select);
  }

  /* ---------------------------------------------------------------- */

  window.FynroxI18n = {
    t: t,
    setLanguage: setLanguage,
    languages: LANGUAGES,
    current: function () { return current; },
  };

  captureOriginals();

  if (/[?&]pseudo=1(&|$)/.test(window.location.search)) {
    loadCatalogue(DEFAULT_LANG, function (en) {
      if (!en) return;
      window.FYNROX_I18N.pseudo = pseudoDict(en);
      current = "pseudo";
      apply(window.FYNROX_I18N.pseudo);
      announce();
    });
  } else {
    setLanguage(stored() || DEFAULT_LANG, false);
  }
})(window, document);
