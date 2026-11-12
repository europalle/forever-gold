#!/usr/bin/env bash
# Builds what members download from the Account page into downloads/:
# the addon as a zip and the Windows app as an installer (ForeverGold.msi).
# Needs Go and wixl (apt package "wixl"). Run after changing addon/ or
# helper/, then commit downloads/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p downloads
VERSION=$(sed -n 's/^const version = "\(.*\)"/\1/p' helper/main.go)
tmp=$(mktemp -d)
(cd helper && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o "$tmp/ForeverGold.exe" .)
(cd helper/installer && wixl -a x64 -D "Version=$VERSION" -D "Exe=$tmp/ForeverGold.exe" -o ../../downloads/ForeverGold.msi ForeverGold.wxs 2>/dev/null)
rm -rf "$tmp" downloads/ForeverGoldHelper.exe
python3 -I - <<'PY'
import os, zipfile
out = "downloads/ForeverGold-addon.zip"
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk("addon/ForeverGold"):
        for f in sorted(files):
            p = os.path.join(root, f)
            z.write(p, os.path.relpath(p, "addon"))
print("wrote", out)
PY
sha256sum downloads/ForeverGold.msi downloads/ForeverGold-addon.zip | sed 's#downloads/##' > downloads/SHA256SUMS
echo "app version $VERSION"
cat downloads/SHA256SUMS
