import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the packaging of the deploy against the bug that kept the
 * production API down for three consecutive deploys.
 *
 * App Service's generated startup script relocates the dependency tree
 * on every boot:
 *
 *   tar -xzf node_modules.tar.gz -C /node_modules
 *   mv -f node_modules _del_node_modules
 *   ln -sfn /node_modules ./node_modules
 *
 * npm workspaces install @fitness-ai-app/config as a relative symlink
 * (node_modules/@fitness-ai-app/config -> ../../packages/config) and
 * tar preserves a symlink as a symlink. Relocated from
 * /home/site/wwwroot to /, it points at /packages/config, which does
 * not exist, so the container died 90 seconds into every cold start:
 *
 *   Error: Cannot find module '@fitness-ai-app/config'
 *   Require stack: .../apps/api/dist/lib/referralCode.js
 *
 * Nothing in the deploy noticed. azure/webapps-deploy reported success
 * every time, because the package shipped correctly — it was the boot
 * that failed, and the health gate that followed could only say the API
 * had not answered.
 *
 * Two things fix it and both have to stay, which is why they are
 * asserted together:
 *
 *   1. The workspace links are materialised into real directories
 *      before the package ships, so the tree is relocatable at all.
 *   2. The deploy cleans its target, so a stale oryx-manifest.toml and
 *      node_modules.tar.gz sitting in persisted /home cannot keep
 *      sending the next boot down the tar.gz path with an old tree.
 *
 * And a check that would fail the deploy rather than ship a tree that
 * cannot boot.
 */

const WORKFLOW = path.join(
  __dirname,
  "../../../.github/workflows/deploy-azure-api.yml",
);
const workflow = fs.readFileSync(WORKFLOW, "utf8");

const CONFIG_PKG = path.join(__dirname, "../../../packages/config/package.json");

describe("Azure API deploy packaging", () => {
  it("read a real workflow, rather than passing on an empty file", () => {
    expect(workflow.length).toBeGreaterThan(2000);
    expect(workflow).toContain("azure/webapps-deploy@v3");
  });

  it("materialises the packages/* workspace links before packaging", () => {
    // The loop has to dereference (cp -RL): a plain cp would copy the
    // link itself and change nothing.
    expect(workflow).toMatch(/cp -RL "\$target" "\$link"/);
    // Scoped to packages/*. Copying the apps/* links would pull every
    // other app's source into the API package for no runtime benefit.
    expect(workflow).toMatch(/\*\/packages\/\*\)/);
  });

  it("does not prune the copied package's declared entry point", () => {
    // packages/types declares main: src/index.ts, so an `rm -rf src`
    // meant to save space would ship a package whose entry point is
    // absent — harmless only until something exports a value from it.
    const materialise = workflow.slice(
      workflow.indexOf("Make the dependency tree survive being relocated"),
      workflow.indexOf("Check the dependency tree can be required after relocation"),
    );
    expect(materialise.length).toBeGreaterThan(200);
    expect(materialise).not.toMatch(/rm -rf[^\n]*\$link\/src/);
  });

  it("refuses to ship a tree that would not boot", () => {
    const verify = workflow.slice(
      workflow.indexOf("Check the dependency tree can be required after relocation"),
      workflow.indexOf("Azure login (OIDC)"),
    );
    expect(verify.length).toBeGreaterThan(200);
    // Catches the symlink surviving, the entry point missing, and a
    // require that fails once the package is moved off this root.
    expect(verify).toMatch(/if \[ -L "\$name" \]/);
    expect(verify).toMatch(/if \[ ! -f "\$name\/\$entry" \]/);
    expect(verify).toMatch(/require\('@fitness-ai-app\/config'\)/);
    expect(verify).toMatch(/exit 1/);
  });

  it("cleans the deploy target so a stale Oryx tarball cannot hijack the boot", () => {
    const deployStep = workflow.slice(workflow.indexOf("azure/webapps-deploy@v3"));
    expect(deployStep).toMatch(/^\s*clean: true$/m);
  });

  it("packages/config still ships a compiled entry point, not TypeScript", () => {
    // The materialised copy is only useful if there is something
    // runnable in it. A main pointing back at src/ would mean the
    // deployed API requires a .ts file at runtime.
    const pkg = JSON.parse(fs.readFileSync(CONFIG_PKG, "utf8")) as {
      main?: string;
    };
    expect(pkg.main).toBe("dist/index.js");
  });

  it("the built API requires exactly the workspace package this covers", () => {
    // If a second workspace package becomes a runtime require, the
    // materialise loop already handles it (it covers all of
    // packages/*), but the verify step names config and types
    // explicitly — this is the tripwire for that list going stale.
    const dist = path.join(__dirname, "../dist");
    if (!fs.existsSync(dist)) return; // not built in this run; nothing to check

    const required = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".js")) {
          for (const m of fs
            .readFileSync(full, "utf8")
            .matchAll(/@fitness-ai-app\/([a-z-]+)/g)) {
            required.add(m[1]);
          }
        }
      }
    };
    walk(dist);

    for (const name of required) {
      expect(["config", "types"]).toContain(name);
    }
  });
});
