// Hook order check (Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/hooksOrder.check.cjs
// Plain Node script (user-mobile has no test runner, and its ESLint config has no react-hooks
// plugin); exits non-zero on any failure.
//
// A hook called after an early `return` runs on some renders and not others, and React then throws
// ("Rendered more hooks than during the previous render"). In Oct 2026 FuelScreen called
// useMeasureUnits() after `if (isError) return …`, so Food crashed when it recovered from an error.
// This flags any use*() call that comes after a top-level return in a component or hook body.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const SRC = path.join(__dirname, "..", "src");

const files = [];
(function walk(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(n)) files.push(p);
  }
})(SRC);

const isFunctionLike = (n) =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n);

/** Does `node` contain a `return` that belongs to the current function (not a nested one)? */
function hasOwnReturn(node) {
  let found = false;
  (function visit(n) {
    if (found) return;
    if (ts.isReturnStatement(n)) {
      found = true;
      return;
    }
    if (isFunctionLike(n)) return;
    ts.forEachChild(n, visit);
  })(node);
  return found;
}

/** Hook calls in `node` that belong to the current function (not to a nested callback). */
function ownHookCalls(node) {
  const calls = [];
  (function visit(n) {
    if (isFunctionLike(n)) return;
    if (ts.isCallExpression(n)) {
      const name = ts.isIdentifier(n.expression)
        ? n.expression.text
        : ts.isPropertyAccessExpression(n.expression)
          ? n.expression.name.text
          : "";
      if (/^use[A-Z0-9]/.test(name)) calls.push({ name, node: n });
    }
    ts.forEachChild(n, visit);
  })(node);
  return calls;
}

let checked = 0;
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  (function visit(n) {
    if (isFunctionLike(n) && n.body && ts.isBlock(n.body)) {
      const fnName =
        (n.name && n.name.getText()) ||
        (ts.isVariableDeclaration(n.parent) && n.parent.name.getText()) ||
        "";
      // Components (PascalCase) and hooks (useX) only.
      if (/^[A-Z]/.test(fnName) || /^use[A-Z0-9]/.test(fnName)) {
        checked++;
        let returnedAt = null;
        for (const st of n.body.statements) {
          if (returnedAt != null) {
            for (const c of ownHookCalls(st)) {
              const at = sf.getLineAndCharacterOfPosition(c.node.getStart()).line + 1;
              failures.push(`${path.relative(SRC, file)}:${at} ${fnName}: ${c.name}() after the return on line ${returnedAt}`);
            }
          }
          if (returnedAt == null && hasOwnReturn(st) && !ts.isReturnStatement(st)) {
            returnedAt = sf.getLineAndCharacterOfPosition(st.getStart()).line + 1;
          }
          if (ts.isReturnStatement(st)) break;
        }
      }
    }
    ts.forEachChild(n, visit);
  })(sf);
}

if (checked < 100) failures.push(`only ${checked} components/hooks found; the scan may be broken`);
for (const f of failures) console.log(`FAIL  ${f}`);
console.log(`${checked} components and hooks checked, ${failures.length} failing`);
process.exit(failures.length ? 1 : 0);
