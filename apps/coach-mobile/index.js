// Local entry point, used instead of the standard `expo/AppEntry.js`.
//
// `expo/AppEntry.js` (the default Expo entry) does `import App from
// '../../App'` — a path *relative to wherever that file physically sits*.
// That only works when `expo` lives in this app's own local
// node_modules/expo/ (two levels below App.tsx). In this npm-workspaces
// monorepo, `expo` is hoisted to the repo root's node_modules instead, so
// `../../App` resolves to a nonexistent `App.tsx` at the monorepo root
// rather than apps/coach-mobile/App.tsx, and bundling fails outright with
// "Unable to resolve module ../../App".
//
// This file reimplements the same one call — registerRootComponent(App) —
// but imports `./App` relative to itself, right next to it in this same
// directory, so it isn't affected by where `expo` itself happens to be
// hoisted to. See package.json's "main" field, which points here instead
// of "expo/AppEntry". Identical fix to apps/user-mobile/index.js.
import { registerRootComponent } from "expo";

import App from "./App";

registerRootComponent(App);
