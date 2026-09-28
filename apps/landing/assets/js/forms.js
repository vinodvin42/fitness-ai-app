/*
 * Spec §8 — the Public Website's forms and the four states it names for
 * them: success, error, already-registered and consent. W-M4 ("contact
 * form has no success or error state") and W-M6 ("partner application
 * forms have no error state") both say to reuse the Early Access
 * pattern, so there is one implementation here and every form on the
 * site uses it.
 *
 * What these forms replace is a `mailto:` link. A mailto has exactly one
 * outcome — "a mail client opened, maybe" — and produces nothing anyone
 * at FynroX can see, count or reply to. That is why none of the four
 * states could exist before.
 *
 * Progressive enhancement, like main.js and invite.js: with JavaScript
 * off the form still renders, and its `action`/`method` post to the API
 * directly rather than silently doing nothing. The enhancement is
 * inline validation feedback and staying on the page.
 *
 * Deliberately NOT a second copy of the validation rules. Every
 * field-level message shown here comes from the API's own `fields`
 * array. A browser that disagrees with the server about what is valid
 * rejects submissions the server would have accepted, and the
 * disagreement is invisible until someone complains.
 */
(function () {
  "use strict";

  function apiBase() {
    // Same convention invite.js and the portals use.
    return (window.FYNROX_API_BASE_URL || "/api").replace(/\/$/, "");
  }

  function fieldWrapper(form, name) {
    var input = form.querySelector('[name="' + name + '"]');
    return input ? input.closest(".field") : null;
  }

  function clearErrors(form) {
    var wrappers = form.querySelectorAll(".field.is-invalid");
    for (var i = 0; i < wrappers.length; i++) {
      wrappers[i].classList.remove("is-invalid");
      var msg = wrappers[i].querySelector(".field__error");
      if (msg) msg.textContent = "";
    }
  }

  function showFieldErrors(form, fields) {
    var firstInvalid = null;
    for (var i = 0; i < fields.length; i++) {
      var wrapper = fieldWrapper(form, fields[i].path);
      if (!wrapper) continue;
      wrapper.classList.add("is-invalid");
      var msg = wrapper.querySelector(".field__error");
      if (msg) msg.textContent = fields[i].message;
      var input = wrapper.querySelector("input, textarea, select");
      if (input) input.setAttribute("aria-invalid", "true");
      if (!firstInvalid) firstInvalid = input;
    }
    // Focus rather than only colour: on a long partner application the
    // offending field is often off-screen.
    if (firstInvalid) firstInvalid.focus();
  }

  /**
   * Renders one of the four states into the form's own status region.
   * `success` hides the form (the visitor is done), the other three
   * leave it in place with what they entered — a form that clears itself
   * on an error makes the visitor retype everything to fix one field.
   */
  function showState(form, state, title, body) {
    var region = document.getElementById(form.getAttribute("data-state-region"));
    if (!region) return;

    region.className = "form-state form-state--" + state;
    region.innerHTML = "";

    var h = document.createElement("p");
    h.className = "form-state__title";
    h.textContent = title;
    region.appendChild(h);

    var p = document.createElement("p");
    p.className = "form-state__body";
    p.textContent = body;
    region.appendChild(p);

    region.hidden = false;
    if (state === "success" || state === "known") form.hidden = true;
    region.focus();
  }

  function payload(form) {
    var data = { kind: form.getAttribute("data-kind") };
    var elements = form.querySelectorAll("input, textarea, select");
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      if (!el.name) continue;
      if (el.type === "checkbox") data[el.name] = el.checked;
      else if (el.value.trim() !== "") data[el.name] = el.value.trim();
    }

    // W-M2 continued: a visitor who arrived from a gym invite or creator
    // referral and registered interest instead of installing is still
    // credited to whoever sent them.
    var params = new URLSearchParams(window.location.search);
    var gym = params.get("gym");
    var creator = params.get("r") || params.get("creator");
    if (gym) {
      data.sourceKind = "gym";
      data.sourceCode = gym;
    } else if (creator) {
      data.sourceKind = "creator";
      data.sourceCode = creator;
    }

    return data;
  }

  function enhance(form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors(form);

      var submit = form.querySelector('[type="submit"]');
      if (submit) {
        submit.disabled = true;
        submit.setAttribute("data-label", submit.textContent);
        submit.textContent = "Sending…";
      }

      function restore() {
        if (!submit) return;
        submit.disabled = false;
        submit.textContent = submit.getAttribute("data-label") || "Submit";
      }

      fetch(apiBase() + "/public/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload(form)),
      })
        .then(function (res) {
          return res.json().then(function (body) {
            return { status: res.status, body: body };
          });
        })
        .then(function (result) {
          restore();

          if (result.status === 201) {
            showState(
              form,
              "success",
              form.getAttribute("data-success-title") || "You're on the list",
              form.getAttribute("data-success-body") ||
                "We've got your details and we'll be in touch. Nothing else is needed from you right now.",
            );
            return;
          }

          if (result.status === 200 && result.body.outcome === "already_registered") {
            // Not an error. The visitor's goal was to be on the list and
            // they are — telling them off would only teach them to
            // resubmit with a second address.
            showState(
              form,
              "known",
              "You're already registered",
              form.getAttribute("data-known-body") ||
                "This email is already on our list, so there's nothing more to do. We'll be in touch at the same address.",
            );
            return;
          }

          if (result.status === 400 && result.body.error && result.body.error.fields) {
            showFieldErrors(form, result.body.error.fields);
            showState(
              form,
              "error",
              "Check the highlighted fields",
              result.body.error.message || "Something in the form needs fixing.",
            );
            return;
          }

          if (result.status === 429) {
            showState(
              form,
              "error",
              "Too many attempts",
              "You've submitted this a few times in a short window. Give it a few minutes and try again.",
            );
            return;
          }

          showState(
            form,
            "error",
            "We couldn't save that",
            "Something went wrong on our side, not yours. Please try again in a moment.",
          );
        })
        .catch(function () {
          restore();
          // A network failure is not a rejection, and saying "we couldn't
          // accept your application" when the request never arrived would
          // lose a partner over a dropped connection.
          showState(
            form,
            "error",
            "We couldn't reach FynroX",
            "Your connection dropped before we could save this. Nothing was submitted — please try again.",
          );
        });
    });
  }

  var forms = document.querySelectorAll("form[data-kind]");
  for (var i = 0; i < forms.length; i++) enhance(forms[i]);
})();
