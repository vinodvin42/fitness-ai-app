// Navigation-safety checks for focused tasks (Oct 2026). Run from the repository root after npm ci:
//   node apps/user-mobile/tests/navigationExits.check.cjs
// user-mobile has no test runner, so this is a plain Node script; it exits non-zero on any failure.
//
// Part 1 (static, TypeScript AST): Today's "Resume session" navigates with `initial: false`, and the five task exits
// use exitTaskToHome instead of popToTop() / navigate(home).
// Part 2 (runtime): the REAL @react-navigation/core and /routers, rendered by react-dom into a stub container, with
// stand-in navigators built like native-stack (StackRouter, all routes rendered) and bottom-tabs (TabRouter, lazy tabs,
// default backBehavior) and the app's route names. It runs the real src/navigation/taskExits.ts. Android Back is
// emulated as @react-navigation/native's useBackButton does (canGoBack() ? goBack() : exit).
// Not covered: native views, gestures, modal presentation, real safe-area values. Device rows N1-N12 cover those.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const SRC = path.join(__dirname, "..", "src");
const results = [];
let failures = 0;
const check = (id, label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  results.push(`${ok ? "PASS" : "FAIL"}  ${id} ${label}${ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`}`);
};

// ---------------- Part 1: static
const parse = (rel) => ts.createSourceFile(rel, fs.readFileSync(path.join(SRC, rel), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const walk = (sf, fn) => { (function v(n) { fn(n); ts.forEachChild(n, v); })(sf); };
const propOf = (obj, name) => obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText() === name);

{ // Resume session: navigate("Train", { screen: "ActiveWorkout", ..., initial: false })
  const sf = parse("screens/today/TodayScreen.tsx");
  const calls = [];
  walk(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "navigate"
      && n.arguments[0] && ts.isStringLiteral(n.arguments[0]) && n.arguments[0].text === "Train" && n.arguments[1] && ts.isObjectLiteralExpression(n.arguments[1])) {
      const screen = propOf(n.arguments[1], "screen");
      if (screen && ts.isStringLiteral(screen.initializer) && screen.initializer.text === "ActiveWorkout") {
        const initial = propOf(n.arguments[1], "initial");
        calls.push(initial ? initial.initializer.getText(sf) : "(missing)");
      }
    }
  });
  check("S1", "TodayScreen: every navigate(\"Train\", { screen: \"ActiveWorkout\" }) sets initial: false", calls.length > 0 && calls.every((c) => c === "false"), true);
}
const exitsIn = (rel) => {
  const sf = parse(rel); const found = { exitTaskToHome: [], popToTop: 0, navigateHome: 0 };
  walk(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    if (ts.isIdentifier(n.expression) && n.expression.text === "exitTaskToHome" && n.arguments[1] && ts.isStringLiteral(n.arguments[1])) found.exitTaskToHome.push(n.arguments[1].text);
    if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "popToTop") found.popToTop++;
    if (ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === "navigate" && n.arguments[0] && ts.isStringLiteral(n.arguments[0])
      && ["TrainDashboard", "FuelDashboard"].includes(n.arguments[0].text)) found.navigateHome++;
  });
  return found;
};
check("S2", "WorkoutComplete: \"Back to Training\" uses exitTaskToHome(TrainDashboard); no popToTop()", (({ exitTaskToHome: e, popToTop }) => [e, popToTop])(exitsIn("screens/train/WorkoutCompleteScreen.tsx")), [["TrainDashboard"], 0]);
check("S3", "ActiveWorkout: Discard uses exitTaskToHome(TrainDashboard); no popToTop()", (({ exitTaskToHome: e, popToTop }) => [e, popToTop])(exitsIn("screens/train/ActiveWorkoutScreen.tsx")), [["TrainDashboard"], 0]);
for (const [id, rel] of [["S4", "screens/fuel/LogMealScreen.tsx"], ["S5", "screens/fuel/ConfirmFoodEstimateScreen.tsx"], ["S6", "screens/fuel/BarcodeScannerScreen.tsx"]]) {
  const f = exitsIn(rel);
  check(id, `${path.basename(rel)}: success exit uses exitTaskToHome(FuelDashboard); no navigate("FuelDashboard")`, [f.exitTaskToHome, f.navigateHome], [["FuelDashboard"], 0]);
}

// ---------------- Part 2: runtime
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const stubDoc = { addEventListener() {}, removeEventListener() {}, activeElement: null, body: null };
globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {}; globalThis.document = stubDoc; // react-dom commit-time reads only
const React = require("react");
const { createRoot } = require("react-dom/client");
const { act } = require("react-dom/test-utils");
const core = require("@react-navigation/core");
const { StackRouter, TabRouter } = require("@react-navigation/routers");
const h = React.createElement;

const exitsMod = { exports: {} };
const exitsJs = ts.transpileModule(fs.readFileSync(path.join(SRC, "navigation", "taskExits.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
// "@react-navigation/native" re-exports CommonActions / StackActions from core (native itself needs React Native).
new Function("module", "exports", "require", exitsJs)(exitsMod, exitsMod.exports, (m) => (m === "@react-navigation/native" ? { CommonActions: core.CommonActions, StackActions: core.StackActions } : require(m)));
const { exitTaskToHome } = exitsMod.exports;

function StackNavigator({ id, initialRouteName, children, screenOptions }) {
  const { state, descriptors, NavigationContent } = core.useNavigationBuilder(StackRouter, { id, initialRouteName, children, screenOptions });
  return h(NavigationContent, null, state.routes.map((r) => h(React.Fragment, { key: r.key }, descriptors[r.key].render())));
}
function TabNavigator({ id, initialRouteName, backBehavior, children, screenOptions }) {
  const { state, descriptors, NavigationContent } = core.useNavigationBuilder(TabRouter, { id, initialRouteName, backBehavior, children, screenOptions });
  const focusedRouteKey = state.routes[state.index].key;
  const [loaded, setLoaded] = React.useState([focusedRouteKey]);
  if (!loaded.includes(focusedRouteKey)) setLoaded([...loaded, focusedRouteKey]);
  return h(NavigationContent, null, state.routes.map((r, i) => (!loaded.includes(r.key) && i !== state.index ? null : h(React.Fragment, { key: r.key }, descriptors[r.key].render()))));
}
const nav = {};
const guard = { prompts: 0, allowLeave: { current: false } };
const screenCache = {};
const screenFor = (name) => screenCache[name] || (screenCache[name] = name === "ActiveWorkout"
  ? function ActiveWorkout({ navigation }) { // the Batch 1 guard, ActiveWorkoutScreen.tsx (beforeRemove)
      nav.ActiveWorkout = navigation;
      React.useEffect(() => navigation.addListener("beforeRemove", (e) => { if (guard.allowLeave.current) return; e.preventDefault(); guard.prompts++; }), [navigation]);
      return null;
    }
  : function Screen({ navigation }) { nav[name] = navigation; return null; });
function leaveWithoutPrompt(allowLeave, go) { allowLeave.current = true; try { go(); } finally { allowLeave.current = false; } } // as in ActiveWorkoutScreen.tsx
const STACKS = {
  Today: ["TodayHome", "Notifications", "Search", "Schedule"],
  Train: ["TrainDashboard", "WorkoutDetail", "ActiveWorkout", "SetRestTracker", "WorkoutComplete", "WorkoutHistory", "ExerciseSwap", "SessionSets", "GymWorkout"],
  Fuel: ["FuelDashboard", "Recipes", "RecipeDetail", "LogMeal", "ConfirmFoodEstimate", "BarcodeScanner", "SnapMeal"],
  Recover: ["RecoverHub", "GuidedSession", "GuidedBreathing", "YogaLibrary"],
  More: ["MoreHub", "Subscription", "Checkout", "PaymentResult"],
};
const Tab = core.createNavigatorFactory(TabNavigator)();
const stackComponents = {};
for (const [tab, names] of Object.entries(STACKS)) {
  const S = core.createNavigatorFactory(StackNavigator)();
  stackComponents[tab] = function TabStack() { return h(S.Navigator, null, names.map((n) => h(S.Screen, { key: n, name: n, component: screenFor(n) }))); };
}
function MainTabs() { return h(Tab.Navigator, null, Object.keys(STACKS).map((t) => h(Tab.Screen, { key: t, name: t, component: stackComponents[t] }))); }

let ctx;
function launch() {
  for (const k of Object.keys(nav)) delete nav[k];
  guard.prompts = 0;
  const ref = core.createNavigationContainerRef(); const unhandled = [];
  const root = createRoot({ nodeType: 1, tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml", ownerDocument: stubDoc, addEventListener() {}, removeEventListener() {}, textContent: "" });
  act(() => root.render(h(core.BaseNavigationContainer, { ref, onUnhandledAction: (a) => unhandled.push(a.type) }, h(MainTabs))));
  ctx = { ref, root, unhandled };
}
const close = () => act(() => ctx.root.unmount());
const run = (fn) => act(() => { fn(); });
const rootState = () => ctx.ref.getRootState();
const focusedTab = () => { const s = rootState(); return s.routes[s.index].name; };
const stack = (tab) => { const r = rootState().routes.find((x) => x.name === tab); return r.state ? r.state.routes.map((x, i) => (i === r.state.index ? `*${x.name}` : x.name)) : "(not mounted)"; };
const hardwareBack = () => { let r; act(() => { r = ctx.ref.canGoBack() ? (ctx.ref.goBack(), "handled") : "app would exit"; }); return r; };
const RESUME = { screen: "ActiveWorkout", params: { workoutId: "w1", sessionId: "s1" }, initial: false }; // TodayScreen's call (S1)
const finish = () => run(() => leaveWithoutPrompt(guard.allowLeave, () => nav.ActiveWorkout.replace("WorkoutComplete", { sessionId: "s1" }))); // ActiveWorkoutScreen finish
const discard = () => run(() => leaveWithoutPrompt(guard.allowLeave, () => exitTaskToHome(nav.ActiveWorkout, "TrainDashboard")));
const backToTraining = () => run(() => exitTaskToHome(nav.WorkoutComplete, "TrainDashboard"));

// Workouts: first entry (tab never opened)
launch(); run(() => nav.TodayHome.navigate("Train", RESUME));
check("C1", "first entry: Resume puts Workouts home underneath", stack("Train"), ["TrainDashboard", "*ActiveWorkout"]);
check("C2", "first entry: the focused route (tab bar hidden) is ActiveWorkout", core.getFocusedRouteNameFromRoute(rootState().routes.find((r) => r.name === "Train")), "ActiveWorkout");
check("C3", "first entry: Android Back shows the leave prompt and keeps the workout", [hardwareBack(), guard.prompts, focusedTab(), stack("Train")], ["handled", 1, "Train", ["TrainDashboard", "*ActiveWorkout"]]);
close();
launch(); run(() => nav.TodayHome.navigate("Train", RESUME)); finish(); backToTraining();
check("C4", "first entry: Finish, then Back to Training, lands on Workouts home", [stack("Train"), ctx.unhandled], [["*TrainDashboard"], []]);
close();
launch(); run(() => nav.TodayHome.navigate("Train", RESUME)); discard();
check("C5", "first entry: Discard lands on Workouts home without a prompt", [stack("Train"), ctx.unhandled, guard.prompts], [["*TrainDashboard"], [], 0]);
close();
launch(); run(() => nav.TodayHome.navigate("Train", RESUME)); finish();
check("C6", "first entry: Android Back on Workout Complete goes to Workouts home", [hardwareBack(), focusedTab(), stack("Train")], ["handled", "Train", ["*TrainDashboard"]]);
close();
launch(); run(() => nav.TodayHome.navigate("Train", RESUME));
run(() => nav.ActiveWorkout.navigate("SetRestTracker", {})); run(() => nav.SetRestTracker.goBack());
run(() => nav.ActiveWorkout.navigate("ExerciseSwap", {})); run(() => nav.ExerciseSwap.goBack());
check("C7", "first entry: tracker and swap Back return to the workout without a prompt", [stack("Train"), guard.prompts], [["TrainDashboard", "*ActiveWorkout"], 0]);
close();

// Workouts: already opened (left at Workout History)
launch(); run(() => nav.TodayHome.navigate("Train")); run(() => nav.TrainDashboard.navigate("WorkoutHistory")); run(() => nav.WorkoutHistory.navigate("Today"));
run(() => nav.TodayHome.navigate("Train", RESUME));
check("O1", "already opened: Resume pushes onto the existing stack (initial ignored once mounted)", stack("Train"), ["TrainDashboard", "WorkoutHistory", "*ActiveWorkout"]);
hardwareBack();
check("O2", "already opened: Android Back shows the leave prompt", guard.prompts, 1);
discard();
check("O3", "already opened: Discard lands on Workouts home", stack("Train"), ["*TrainDashboard"]);
close();
launch(); run(() => nav.TodayHome.navigate("Train")); run(() => nav.TrainDashboard.navigate("WorkoutDetail", { workoutId: "w1" }));
run(() => nav.WorkoutDetail.navigate("ActiveWorkout", { workoutId: "w1", sessionId: "s1" })); finish(); backToTraining();
check("O4", "in tab: Workouts home › details › workout › Finish › Back to Training", stack("Train"), ["*TrainDashboard"]);
close();

// Supported direct entry: a task as the only screen in its stack (any entry without initial: false)
launch(); run(() => nav.TodayHome.navigate("Train", { screen: "ActiveWorkout", params: { workoutId: "w1", sessionId: "s1" } }));
check("D1", "direct entry: the workout is the only screen", stack("Train"), ["*ActiveWorkout"]);
discard();
check("D2", "direct entry: Discard still lands on Workouts home", [stack("Train"), ctx.unhandled], [["*TrainDashboard"], []]);
close();
launch(); run(() => nav.TodayHome.navigate("Train", { screen: "ActiveWorkout", params: { workoutId: "w1", sessionId: "s1" } })); finish(); backToTraining();
check("D3", "direct entry: Finish, then Back to Training, lands on Workouts home", [stack("Train"), ctx.unhandled], [["*TrainDashboard"], []]);
close();
launch(); run(() => nav.TodayHome.navigate("Train", { screen: "WorkoutDetail", params: { workoutId: "w1" } }));
run(() => nav.WorkoutDetail.navigate("ActiveWorkout", { workoutId: "w1", sessionId: "s1" })); finish(); backToTraining();
check("D4", "entry through workout details (Today/Schedule/Search): Back to Training lands on Workouts home", stack("Train"), ["*TrainDashboard"]);
close();
launch(); run(() => nav.TodayHome.navigate("Train", { screen: "GymWorkout" }));
run(() => nav.GymWorkout.navigate("ActiveWorkout", { workoutId: "w1", sessionId: "s1" })); discard();
check("D5", "entry through My Gym's gym workout: Discard lands on Workouts home", stack("Train"), ["*TrainDashboard"]);
close();

// Food: Today › Log Meal (TodayScreen keeps its first-entry call; the success exits make it safe)
for (const [id, label, steps] of [
  ["F1", "first entry: confirm an estimate", () => { run(() => nav.LogMeal.navigate("ConfirmFoodEstimate", { estimate: {} })); run(() => exitTaskToHome(nav.ConfirmFoodEstimate, "FuelDashboard")); }],
  ["F2", "first entry: manual save", () => run(() => exitTaskToHome(nav.LogMeal, "FuelDashboard"))],
  ["F3", "first entry: barcode log", () => { run(() => nav.LogMeal.navigate("BarcodeScanner", { mealType: "lunch" })); run(() => exitTaskToHome(nav.BarcodeScanner, "FuelDashboard")); }],
]) {
  launch(); run(() => nav.TodayHome.navigate("Fuel", { screen: "LogMeal", params: { mealType: "lunch" } }));
  steps();
  const after = stack("Fuel"); const back = hardwareBack();
  check(id, `${label} lands on Food home; Back then returns to Today (the finished task never reappears)`, [after, back, focusedTab(), stack("Fuel")], [["*FuelDashboard"], "handled", "Today", ["*FuelDashboard"]]);
  close();
}
launch(); run(() => nav.TodayHome.navigate("Fuel", { screen: "LogMeal", params: { mealType: "lunch" } })); run(() => nav.LogMeal.goBack());
check("F4", "first entry: the back chip still returns to Today", [focusedTab(), stack("Fuel")], ["Today", ["*LogMeal"]]);
close();
launch(); run(() => nav.TodayHome.navigate("Fuel")); run(() => nav.FuelDashboard.navigate("LogMeal", { mealType: "lunch" }));
run(() => nav.LogMeal.navigate("ConfirmFoodEstimate", { estimate: {} })); run(() => exitTaskToHome(nav.ConfirmFoodEstimate, "FuelDashboard"));
check("F5", "already opened: confirm an estimate lands on Food home (same as before)", stack("Fuel"), ["*FuelDashboard"]);
close();

// Reset boundaries: RESET is handled by the caller's own stack only when every route name belongs to it
// (routers BaseRouter RESET); otherwise core bubbles it to the parent and then to other child navigators.
launch();
run(() => nav.TodayHome.navigate("Fuel")); run(() => nav.FuelDashboard.navigate("Recipes")); run(() => nav.Recipes.navigate("Today"));
run(() => nav.TodayHome.navigate("Train", { screen: "ActiveWorkout", params: { workoutId: "w1", sessionId: "s1" } }));
const todayBefore = stack("Today");
discard();
check("B1", "reset on direct-entry Discard touches only the Workouts stack (Food, Today and the tab state untouched)",
  [stack("Train"), stack("Fuel"), stack("Today"), focusedTab(), ctx.unhandled], [["*TrainDashboard"], ["FuelDashboard", "*Recipes"], todayBefore, "Train", []]);
close();
launch();
run(() => nav.TodayHome.navigate("Train")); run(() => nav.TrainDashboard.navigate("WorkoutHistory")); run(() => nav.WorkoutHistory.navigate("Today"));
run(() => nav.TodayHome.navigate("Fuel", { screen: "LogMeal", params: { mealType: "lunch" } }));
run(() => exitTaskToHome(nav.LogMeal, "FuelDashboard"));
check("B2", "reset on a direct-entry Food exit touches only the Food stack", [stack("Fuel"), stack("Train")], [["*FuelDashboard"], ["TrainDashboard", "*WorkoutHistory"]]);
close();
// Hazard the static check S7 guards against: a home that is not in the caller's stack bubbles and resets ANOTHER stack.
launch();
run(() => nav.TodayHome.navigate("Fuel")); run(() => nav.FuelDashboard.navigate("Recipes")); run(() => nav.Recipes.navigate("Today"));
run(() => nav.TodayHome.navigate("Train", { screen: "ActiveWorkout", params: { workoutId: "w1", sessionId: "s1" } }));
run(() => leaveWithoutPrompt(guard.allowLeave, () => exitTaskToHome(nav.ActiveWorkout, "FuelDashboard")));
const wrongHome = [stack("Train"), stack("Fuel")];
close();
{ // S7: every exitTaskToHome(navigation, home) call names a home in the calling screen's own stack
  const stackOf = {};
  for (const [stackFile, label] of [["navigation/TrainStack.tsx", "Train"], ["navigation/FuelStack.tsx", "Fuel"]]) {
    const sf = parse(stackFile);
    walk(sf, (n) => {
      if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(sf) === "Stack.Screen") {
        const attr = (k) => n.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText(sf) === k);
        const name = attr("name"), comp = attr("component");
        if (name && comp && name.initializer && comp.initializer) {
          const routeName = name.initializer.getText(sf).replace(/["{}]/g, "");
          const component = comp.initializer.getText(sf).replace(/[{}]/g, "");
          stackOf[component] = label; stackOf[`route:${routeName}`] = label;
        }
      }
    });
  }
  const sites = [];
  for (const [rel, component] of [["screens/train/WorkoutCompleteScreen.tsx", "WorkoutCompleteScreen"], ["screens/train/ActiveWorkoutScreen.tsx", "ActiveWorkoutScreen"],
    ["screens/fuel/LogMealScreen.tsx", "LogMealScreen"], ["screens/fuel/ConfirmFoodEstimateScreen.tsx", "ConfirmFoodEstimateScreen"], ["screens/fuel/BarcodeScannerScreen.tsx", "BarcodeScannerScreen"]]) {
    for (const home of exitsIn(rel).exitTaskToHome) sites.push(`${component}:${stackOf[component]}->${home}:${stackOf[`route:${home}`]}`);
  }
  check("S7", "each exitTaskToHome home route is in the calling screen's own stack", sites.every((s) => { const [a, b] = s.split("->"); return a.split(":")[1] && a.split(":")[1] === b.split(":")[1]; }) && sites.length === 5, true);
}

// Known limitation (documented, not asserted as desired behaviour): with no home underneath, Android Back on the
// workout switches tab without the prompt. No entry in the app produces that stack after this change (S1).
launch(); run(() => nav.TodayHome.navigate("Train", { screen: "ActiveWorkout", params: { workoutId: "w1", sessionId: "s1" } }));
const limitation = [hardwareBack(), guard.prompts, focusedTab()];
close();

console.log(results.join("\n"));
console.log(`INFO  known limitation (direct-entry Android Back on the workout): ${JSON.stringify(limitation)}`);
console.log(`INFO  hazard guarded by S7 (a home outside the caller's stack) [Train, Fuel]: ${JSON.stringify(wrongHome)}`);
console.log(failures ? `${failures} failure(s)` : `${results.length}/${results.length} passed`);
process.exitCode = failures ? 1 : 0;
