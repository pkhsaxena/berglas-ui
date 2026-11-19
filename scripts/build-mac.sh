#!/bin/zsh
# Builds dist/berglas-ui.app: the ui and core in a native window (Wails v2).
#
#   scripts/build-mac.sh               this mac's cpu (arm64 or x86_64)
#   UNIVERSAL=1 scripts/build-mac.sh   one app for Apple silicon and Intel (about twice the size)
#   SKIP_UI=1 scripts/build-mac.sh     reuse the ui already in core/webui/dist
#   scripts/build-mac.sh --dmg         also pack the app into dist/berglas-ui-<version>-<arch>.dmg
#                                      (drag-to-Applications disk image; flags combine with the above)
#
# The app is signed ad hoc, which is enough to run it on the mac that built
# it. To hand it to others without Gatekeeper warnings it needs a Developer
# ID signature and notarization (paid Apple developer account).
set -euo pipefail

DMG=
for arg in "$@"; do
  case $arg in
    --dmg) DMG=1 ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "error: unknown option $arg (see --help)" >&2; exit 2 ;;
  esac
done

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
# the icon, made from the SVGs next to it: each size drawn from the vector at
# its exact pixels, with 16, 32 and 64 px drawn on their own pixel grids
cp "$ROOT/core/cmd/berglas-ui-desktop/icon/berglas-ui.icns" "$APP/Contents/Resources/berglas-ui.icns"
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
  <key>CFBundleIconFile</key><string>berglas-ui</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key><string>berglas-ui link</string>
      <key>CFBundleURLSchemes</key><array><string>berglas-ui</string></array>
    </dict>
  </array>
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

if [[ -n $DMG ]]; then
  # the app next to a link to /Applications, so the window that opens says
  # what to do: drag one onto the other. Compressed and read-only (UDZO).
  ARCH=$([[ -n ${UNIVERSAL:-} ]] && echo universal || go env GOARCH)
  IMG="$OUT/berglas-ui-${VERSION#v}-$ARCH.dmg"
  mkdir "$WORK/dmg"
  cp -R "$APP" "$WORK/dmg/"
  ln -s /Applications "$WORK/dmg/Applications"
  rm -f "$IMG"
  hdiutil create -quiet -volname berglas-ui -srcfolder "$WORK/dmg" -fs HFS+ -format UDZO "$IMG"
  hdiutil verify -quiet "$IMG"
  codesign --force --sign - "$IMG" >/dev/null
  echo "packed $IMG ($(du -sh "$IMG" | cut -f1)); ad hoc signed like the app, so other macs ask before opening it"
fi
