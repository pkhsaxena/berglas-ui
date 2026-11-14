#!/bin/zsh
# Builds dist/berglas-ui.app: the ui and core in a native window (Wails v2).
#
#   scripts/build-mac.sh               this mac's cpu (arm64 or x86_64)
#   UNIVERSAL=1 scripts/build-mac.sh   one app for Apple silicon and Intel (about twice the size)
#   SKIP_UI=1 scripts/build-mac.sh     reuse the ui already in core/webui/dist
#
# The app is signed ad hoc, which is enough to run it on the mac that built
# it. To hand it to others without Gatekeeper warnings it needs a Developer
# ID signature and notarization (paid Apple developer account).
set -euo pipefail

ROOT=${0:A:h:h}
VERSION=${VERSION:-$(git -C "$ROOT" describe --tags --always --dirty 2>/dev/null || echo dev)}
OUT="$ROOT/dist"
APP="$OUT/berglas-ui.app"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

[[ -n ${SKIP_UI:-} ]] || npm --prefix "$ROOT/ui" run build

# The app injects the self-test scripts into the page; one that doesn't parse
# never runs, and the self-test window just sits there. Catch that here.
if command -v node >/dev/null; then
  for f in "$ROOT"/core/cmd/berglas-ui-desktop/selftest*.js; do
    node --check "$f" || { echo "error: $f does not parse" >&2; exit 1; }
  done
fi

build() { # build <goarch> <out>
  (cd "$ROOT/core" &&
    CGO_ENABLED=1 GOOS=darwin GOARCH=$1 CGO_LDFLAGS="-framework UniformTypeIdentifiers" MACOSX_DEPLOYMENT_TARGET=11.0 \
      go build -trimpath -tags desktop,production -ldflags "-w -s -X main.version=$VERSION" -o "$2" ./cmd/berglas-ui-desktop)
}

if [[ -n ${UNIVERSAL:-} ]]; then
  build arm64 "$WORK/arm64"
  build amd64 "$WORK/amd64"
  lipo -create -output "$WORK/berglas-ui" "$WORK/arm64" "$WORK/amd64"
else
  build "$(go env GOARCH)" "$WORK/berglas-ui"
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$WORK/berglas-ui" "$APP/Contents/MacOS/berglas-ui"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>berglas-ui</string>
  <key>CFBundleDisplayName</key><string>berglas-ui</string>
  <key>CFBundleIdentifier</key><string>dev.berglas-ui.desktop</string>
  <key>CFBundleExecutable</key><string>berglas-ui</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION#v}</string>
  <key>CFBundleVersion</key><string>${VERSION#v}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
</dict>
</plist>
PLIST
codesign --force --sign - "$APP" >/dev/null
echo "built $APP ($VERSION, $(du -sh "$APP" | cut -f1), $(lipo -archs "$APP/Contents/MacOS/berglas-ui"))"
