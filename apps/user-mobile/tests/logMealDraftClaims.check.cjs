// Static regression check for LogMealScreen's draft-persistence wording (no React Native renderer needed).
// Run from the repository root after npm ci:  node apps/user-mobile/tests/logMealDraftClaims.check.cjs [file]
// user-mobile has no component test runner, so this inspects the screen's source with the TypeScript parser:
//   1. every text that claims the draft is on the device renders only under `draftOnDevice` (true branch);
//   2. `draftOnDevice` compares the form with the confirmed snapshot;
//   3. the confirmed snapshot is set (non-null) only from a successful device read or write.
// It does not render the screen; device rows F1-F6 in the device checklist cover the rendered result.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const file = process.argv[2] || path.join(__dirname, "..", "src", "screens", "fuel", "LogMealScreen.tsx");
const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const CLAIM = /on (this|the) device|stays on|safe on|saved on/i;
const failures = [];
const passes = [];
const where = (n) => `line ${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
const isId = (n, name) => n && ts.isIdentifier(n) && n.text === name;

/** True when `node` is only reached when `draftOnDevice` is true. */
function guardedByDraftOnDevice(node) {
  for (let child = node, p = node.parent; p; child = p, p = p.parent) {
    if (ts.isConditionalExpression(p) && isId(p.condition, "draftOnDevice") && child === p.whenTrue) return true;
    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && isId(p.left, "draftOnDevice") && child === p.right) return true;
    if (ts.isFunctionLike(p)) return false; // stop at the enclosing function
  }
  return false;
}

/** The innermost `.then(callback)` whose callee chain starts with a call to one of `fns`. */
function thenOfCall(node, fns) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && p.expression.name.text === "then") {
      let target = p.expression.expression;
      while (ts.isCallExpression(target) && ts.isPropertyAccessExpression(target.expression)) target = target.expression.expression;
      if (ts.isCallExpression(target) && ts.isIdentifier(target.expression) && fns.includes(target.expression.text)) return { fn: target.expression.text, then: p };
    }
  }
  return null;
}

let claims = 0;
let draftOnDeviceDecl = null;
const snapshotSets = [];
(function visit(n) {
  if (ts.isJsxText(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
    const text = n.text.trim();
    if (text && CLAIM.test(text)) {
      claims++;
      (guardedByDraftOnDevice(n) ? passes : failures).push(`${where(n)}: "${text.slice(0, 70)}" ${guardedByDraftOnDevice(n) ? "renders only when draftOnDevice" : "is NOT guarded by draftOnDevice"}`);
    }
  }
  if (ts.isVariableDeclaration(n) && isId(n.name, "draftOnDevice")) draftOnDeviceDecl = n;
  if (ts.isCallExpression(n) && isId(n.expression, "setPersistedSnapshot")) snapshotSets.push(n);
  ts.forEachChild(n, visit);
})(sf);

if (claims === 0) failures.push("no device-persistence claim found at all (the check would be vacuous; update CLAIM if the copy changed)");

const init = draftOnDeviceDecl && draftOnDeviceDecl.initializer ? draftOnDeviceDecl.initializer.getText(sf) : "";
if (/persistedSnapshot\s*!==\s*null/.test(init) && /persistedSnapshot\s*===\s*draftSnapshot\(/.test(init)) passes.push("draftOnDevice = confirmed snapshot equals the current form");
else failures.push(`draftOnDevice does not compare the confirmed snapshot with the current form: "${init}"`);

for (const call of snapshotSets) {
  const arg = call.arguments[0];
  if (!arg || arg.kind === ts.SyntaxKind.NullKeyword) continue; // clearing the claim is always allowed
  const ctx = thenOfCall(call, ["readOwnedDraft", "writeOwnedDraft"]);
  if (!ctx) { failures.push(`${where(call)}: setPersistedSnapshot(${arg.getText(sf)}) outside a device read/write result`); continue; }
  if (ctx.fn === "writeOwnedDraft") {
    const cb = ctx.then.arguments[0];
    const param = cb && ts.isFunctionLike(cb) && cb.parameters[0] ? cb.parameters[0].name.getText(sf) : null;
    const ok = param && ts.isConditionalExpression(arg) && isId(arg.condition, param) && arg.whenFalse.kind === ts.SyntaxKind.NullKeyword;
    (ok ? passes : failures).push(`${where(call)}: snapshot after writeOwnedDraft ${ok ? `set only when its result (${param}) is true` : `is not conditional on the write result: ${arg.getText(sf)}`}`);
  } else {
    passes.push(`${where(call)}: snapshot from a draft restored from the device (readOwnedDraft)`);
  }
}

for (const p of passes) console.log(`PASS  ${p}`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(failures.length ? `${failures.length} failure(s)` : `${passes.length}/${passes.length} passed`);
process.exitCode = failures.length ? 1 : 0;
