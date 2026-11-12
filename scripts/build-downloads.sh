#!/usr/bin/env bash
# Builds what members download from the Account page into downloads/:
# the addon as a zip and the Windows helper. Run after changing addon/ or
# helper/, then commit downloads/.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p downloads
(cd helper && GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "-s -w -H windowsgui" -o ../downloads/ForeverGoldHelper.exe .)
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
sha256sum downloads/ForeverGoldHelper.exe downloads/ForeverGold-addon.zip | sed 's#downloads/##' > downloads/SHA256SUMS
cat downloads/SHA256SUMS
