#!/usr/bin/env node
/*
 * Point the generated Android release build at a real signing key.
 *
 * `expo prebuild` generates android/ from scratch every run, and its
 * release buildType ships with `signingConfig signingConfigs.debug` —
 * the debug key. An APK signed with the debug key installs, so nothing
 * obviously fails; it is simply not the app. Android identifies an app
 * by its signature, so a debug-signed build cannot upgrade a real
 * install, and Play would never accept it.
 *
 * This edits the generated file rather than committing android/, which
 * is gitignored on purpose.
 *
 * Every edit below asserts on the text it expects. If a future Expo
 * template changes that text, this exits non-zero and the build stops.
 * The alternative — a regex that quietly matches nothing — would ship a
 * debug-signed APK that looks fine until someone tries to upgrade.
 *
 * Usage: android-release-signing.js <path-to-android-dir>
 * Reads the key's details from the environment:
 *   ANDROID_KEYSTORE_PATH, ANDROID_KEYSTORE_PASSWORD,
 *   ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD
 */
const fs = require("node:fs");
const path = require("node:path");

const androidDir = process.argv[2];
if (!androidDir) {
  console.error("usage: android-release-signing.js <path-to-android-dir>");
  process.exit(1);
}

const required = [
  "ANDROID_KEYSTORE_PATH",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`::error::Missing signing configuration: ${missing.join(", ")}.`);
  process.exit(1);
}

const keystore = path.resolve(process.env.ANDROID_KEYSTORE_PATH);
if (!fs.existsSync(keystore)) {
  console.error(`::error::The keystore does not exist at ${keystore}.`);
  process.exit(1);
}

const gradlePath = path.join(androidDir, "app", "build.gradle");
let gradle = fs.readFileSync(gradlePath, "utf8");

/** Replace exactly once, or stop. */
function replaceOnce(haystack, needle, replacement, what) {
  const count = haystack.split(needle).length - 1;
  if (count !== 1) {
    console.error(
      `::error::Expected exactly one occurrence of ${what} in app/build.gradle, found ${count}. ` +
        `The Expo template has changed; this script must be updated rather than left to match nothing.`,
    );
    process.exit(1);
  }
  return haystack.replace(needle, replacement);
}

// 1. Add a `release` signing config beside the generated `debug` one.
//    The values come from gradle.properties, written below, so that the
//    passwords are not baked into a file the build prints on failure.
const DEBUG_CONFIG = `    signingConfigs {
        debug {`;
gradle = replaceOnce(
  gradle,
  DEBUG_CONFIG,
  `    signingConfigs {
        release {
            storeFile file(FYNROX_RELEASE_STORE_FILE)
            storePassword FYNROX_RELEASE_STORE_PASSWORD
            keyAlias FYNROX_RELEASE_KEY_ALIAS
            keyPassword FYNROX_RELEASE_KEY_PASSWORD
        }
        debug {`,
  "the signingConfigs block",
);

// 2. Point the release buildType at it. The generated file uses the
//    debug config for BOTH buildTypes, so this is matched with its
//    surrounding release block rather than on its own.
const RELEASE_USES_DEBUG = /(release\s*\{[^}]*?)signingConfig signingConfigs\.debug/s;
if (!RELEASE_USES_DEBUG.test(gradle)) {
  console.error(
    "::error::Could not find the release buildType using signingConfigs.debug in app/build.gradle. " +
      "The Expo template has changed; refusing to produce a build that might be debug-signed.",
  );
  process.exit(1);
}
gradle = gradle.replace(RELEASE_USES_DEBUG, "$1signingConfig signingConfigs.release");

fs.writeFileSync(gradlePath, gradle);

// 3. The key's details go in gradle.properties.
const propsPath = path.join(androidDir, "gradle.properties");
const props = fs.readFileSync(propsPath, "utf8");
fs.writeFileSync(
  propsPath,
  `${props.trimEnd()}

# Written by scripts/android-release-signing.js for this build only.
FYNROX_RELEASE_STORE_FILE=${keystore}
FYNROX_RELEASE_STORE_PASSWORD=${process.env.ANDROID_KEYSTORE_PASSWORD}
FYNROX_RELEASE_KEY_ALIAS=${process.env.ANDROID_KEY_ALIAS}
FYNROX_RELEASE_KEY_PASSWORD=${process.env.ANDROID_KEY_PASSWORD}
`,
);

// 4. Read it back. A release buildType still on the debug key is the
//    failure this script exists to prevent, so it is checked rather
//    than assumed.
//
//    Scoped to the buildTypes section on purpose. A first attempt
//    searched the whole file for `release { ... }` and matched the
//    signingConfigs.release block added in step 1, which of course does
//    not mention signingConfigs.release — so the check failed on a file
//    that was in fact correct. An assertion that looks at the wrong
//    place is worse than none: it would have been "fixed" by loosening
//    it.
const after = fs.readFileSync(gradlePath, "utf8");
const buildTypesAt = after.indexOf("buildTypes {");
if (buildTypesAt < 0) {
  console.error("::error::No buildTypes block in app/build.gradle after patching.");
  process.exit(1);
}
const buildTypes = after.slice(buildTypesAt);
const releaseBlock = /release\s*\{[^}]*\}/s.exec(buildTypes);
if (!releaseBlock) {
  console.error("::error::No release buildType in app/build.gradle after patching.");
  process.exit(1);
}
if (!releaseBlock[0].includes("signingConfigs.release")) {
  console.error("::error::After patching, the release buildType is still not using signingConfigs.release.");
  process.exit(1);
}
if (releaseBlock[0].includes("signingConfigs.debug")) {
  console.error("::error::After patching, the release buildType still references the debug key.");
  process.exit(1);
}
console.log("release signing configured; keystore:", path.basename(keystore));
