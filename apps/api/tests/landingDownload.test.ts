import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The download page's Android link must not expire.
 *
 * It has, twice. EAS gives an internal-distribution artifact 14 days,
 * and the page linked one directly: the button went dead on 6 Oct and
 * again on 17 Oct, both times without anyone touching the site. The
 * clock was visible only in an HTML comment.
 *
 * Rebuilding to refresh the URL is not a fix either. Run 18 of the EAS
 * workflow failed with "This account has used its Android builds from
 * the Free plan this month" — a fortnightly rebuild spends a scarce
 * quota on a link, and ships a different build to testers as a side
 * effect of wanting the same one to stay reachable.
 *
 * So the binary lives on a GitHub Release, which does not expire, and
 * the site deploy copies it to /downloads/fynrox-android.apk. The APK is
 * deliberately NOT committed here: ~90MB per release would weigh down
 * every clone of this repository forever.
 *
 * That arrangement has three parts and all three have to hold, which is
 * why they are asserted together.
 */

const LANDING = path.join(__dirname, "../../landing");
const DOWNLOAD = fs.readFileSync(path.join(LANDING, "download.html"), "utf8");
const SITE_WORKFLOW = fs.readFileSync(
  path.join(__dirname, "../../../.github/workflows/azure-static-web-apps-purple-sea-0edcdc910.yml"),
  "utf8",
);
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(LANDING, "staticwebapp.config.json"), "utf8"),
) as { mimeTypes?: Record<string, string>; navigationFallback?: { exclude?: string[] } };

const STABLE_PATH = "/downloads/fynrox-android.apk";

describe("the Android download link", () => {
  it("read the real page, rather than passing on an empty file", () => {
    expect(DOWNLOAD.length).toBeGreaterThan(2000);
    expect(DOWNLOAD).toContain("platform-card");
  });

  it("points at the stable path, not an artifact URL that expires", () => {
    expect(DOWNLOAD).toContain(`href="${STABLE_PATH}"`);
  });

  it("links no expiring artifact host anywhere on the page", () => {
    // Catches the specific regression: someone pasting a fresh EAS URL
    // in because it is the quickest way to ship a build.
    const expiring = [...DOWNLOAD.matchAll(/https?:\/\/[^"'\s)]*expo\.dev\/artifacts\/[^"'\s)]*/g)].map(
      (m) => m[0],
    );
    expect(expiring, "EAS artifact links live 14 days").toEqual([]);
  });

  it("the deploy step that produces that file still exists", () => {
    // Without this step the href above is a 404 — a worse failure than
    // the expiring link, because nothing announces it.
    expect(SITE_WORKFLOW).toContain("Fetch the Android build the download page serves");
    expect(SITE_WORKFLOW).toContain("combined-web-deploy/downloads/fynrox-android.apk");
    expect(SITE_WORKFLOW).toContain("gh release download");
    // It must fail the deploy rather than ship a page whose button 404s.
    expect(SITE_WORKFLOW).toMatch(/No release carries the Android build[\s\S]*?exit 1/);
    // And validate what it fetched, since this is the copy visitors get.
    expect(SITE_WORKFLOW).toContain("scripts/validate-apk.sh");
  });

  it("the APK is not committed to this repository", () => {
    const stray = fs.existsSync(path.join(LANDING, "downloads"));
    expect(stray, "~90MB per release would weigh down every clone").toBe(false);
  });

  it("Azure serves the file rather than rewriting it to HTML", () => {
    // Static Web Apps rewrites unknown paths to 404.html. Without the
    // exclusion the APK request returns an HTML page with a 200, and the
    // visitor gets a renamed web page instead of an installer — the same
    // shape as the bug that made /gym/* render unstyled.
    expect(CONFIG.navigationFallback?.exclude ?? []).toContain("/downloads/*");
    expect(CONFIG.mimeTypes?.[".apk"]).toBe("application/vnd.android.package-archive");
  });
});
