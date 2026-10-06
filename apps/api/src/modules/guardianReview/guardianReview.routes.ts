import express, { Router, Response } from "express";
import { guardianPublicRateLimit } from "../../middleware/rateLimit";
import { decideGuardianReview, lookupGuardianToken } from "./guardianReview.service";

/**
 * Public, token-authenticated HTML pages for the guardian. No JS, no inline
 * handlers (helmet's CSP stays intact): the approve/decline buttons are plain
 * HTML forms POSTing to /guardian-review/decide.
 */
export const guardianReviewRouter = Router();

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(res: Response, status: number, title: string, body: string) {
  res
    .status(status)
    .set("Cache-Control", "no-store")
    .type("html")
    .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;background:#09090b;color:#f4f4f5;font:16px/1.5 system-ui,sans-serif;display:flex;justify-content:center;padding:24px}main{max-width:480px;width:100%}h1{font-size:22px}p{color:#b0b8c6}.card{background:#121215;border:1px solid #27272a;border-radius:14px;padding:16px;margin:16px 0}button{width:100%;height:48px;border-radius:12px;border:0;font-size:16px;font-weight:600;cursor:pointer;margin-top:10px}.ok{background:#2563eb;color:#fff}.no{background:#121215;color:#f4f4f5;border:1px solid #27272a}</style></head><body><main>${body}</main></body></html>`);
}

function message(res: Response, status: number, title: string, text: string) {
  page(res, status, title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`);
}

function problem(res: Response, kind: "invalid" | "expired" | "already_decided", status?: string) {
  if (kind === "expired") return message(res, 410, "This link has expired", "Ask the young person to send a new guardian email from the app.");
  if (kind === "already_decided") {
    return message(res, 409, "This link was already used", status === "declined" ? "A decision (declined) was already recorded." : "A decision (approved) was already recorded.");
  }
  return message(res, 404, "This link is not valid", "It may have been replaced by a newer email. Use the most recent email you received.");
}

guardianReviewRouter.get("/guardian-review/approve", guardianPublicRateLimit, async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const found = await lookupGuardianToken(token);
    if (found.kind !== "ok") return problem(res, found.kind, found.kind === "already_decided" ? found.status : undefined);
    page(
      res,
      200,
      "Guardian authorization",
      `<h1>Guardian authorization</h1>
<p><strong>${esc(found.childName)}</strong> is setting up a 23PrimeFit fitness account and has told us they are under 18.</p>
<div class="card"><p>If you approve, they can answer health and fitness questions and receive personalized plans and guidance. If you decline, those features stay off.</p>
<p>This does not verify identity or establish legal compliance on its own. Only approve if you are this person's parent or legal guardian.</p></div>
<form method="post" action="/guardian-review/decide"><input type="hidden" name="token" value="${esc(token)}"><button class="ok" type="submit" name="decision" value="approve">Approve</button><button class="no" type="submit" name="decision" value="decline">Decline</button></form>`,
    );
  } catch (err) {
    next(err);
  }
});

guardianReviewRouter.post(
  "/guardian-review/decide",
  guardianPublicRateLimit,
  express.urlencoded({ extended: false, limit: "4kb" }),
  async (req, res, next) => {
    try {
      const token = typeof req.body?.token === "string" ? req.body.token : "";
      const decision = req.body?.decision === "approve" ? "approved" : req.body?.decision === "decline" ? "declined" : null;
      if (!decision) return message(res, 400, "Choose approve or decline", "No decision was submitted.");
      const result = await decideGuardianReview(token, decision);
      if (result.kind !== "ok") return problem(res, result.kind, result.kind === "already_decided" ? result.status : undefined);
      message(
        res,
        200,
        decision === "approved" ? "Authorization recorded" : "Decline recorded",
        decision === "approved" ? "Thank you. The young person can now continue setup in the app." : "Thank you. Health and personalization features will stay off.",
      );
    } catch (err) {
      next(err);
    }
  },
);
