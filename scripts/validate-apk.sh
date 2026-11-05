#!/usr/bin/env bash
# Validate a downloaded Android artifact before anything publishes it.
#
# One copy of these checks, used by both publishers: the EAS workflow
# after it builds, and publish-apk-release.yml when it rescues an
# artifact that already exists. They disagreeing would be worse than the
# small indirection.
#
# Usage: validate-apk.sh <path-to-apk>
# Prints the byte count on success; exits non-zero with ::error:: on failure.
set -euo pipefail

apk="${1:?usage: validate-apk.sh <path-to-apk>}"

if [ ! -f "$apk" ]; then
  echo "::error::$apk does not exist." >&2
  exit 1
fi

bytes=$(wc -c < "$apk")

# An APK is a zip, so it starts "PK". This catches an error page served
# with a 200, which would otherwise be published as the app.
if [ "$(head -c 2 "$apk")" != "PK" ]; then
  echo "::error::$apk is not a zip/APK (does not start with 'PK'). Size was $bytes bytes." >&2
  exit 1
fi

# Releases have been ~84MB. Anything in single-digit megabytes is not
# this app. An earlier version of this check read Content-Length from a
# HEAD request, which can be absent on HTTP/2 and made the size
# arithmetic silently produce "~0MB".
if [ "$bytes" -lt 10000000 ]; then
  echo "::error::$apk is only $bytes bytes, far smaller than expected for this app." >&2
  exit 1
fi

# AndroidManifest.xml is in every APK; a zip that lacks it is some other
# archive that happens to start with PK.
if ! unzip -l "$apk" 2>/dev/null | grep -q "AndroidManifest.xml"; then
  echo "::error::$apk has no AndroidManifest.xml, so it is not an Android package." >&2
  exit 1
fi

echo "$bytes"
