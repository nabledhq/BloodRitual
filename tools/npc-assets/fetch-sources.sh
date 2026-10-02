#!/usr/bin/env bash
# Downloads the CC0 Quaternius source files used by build.mjs into ./sources.
#
# The packs are distributed on https://quaternius.com and itch.io; the files
# used here are the free "Standard" versions mirrored (unchanged, as glTF) in
# a public GitHub repository, pinned to a commit so builds are reproducible.
# See ASSETS_LICENSES.md for the original pack pages and licences.
set -euo pipefail
cd "$(dirname "$0")"

REPO=https://github.com/shellybotmoyer/stargate-universe.git
COMMIT=84e7b1add6e2895eed8eb7f91c2392fa264ddd98

rm -rf sources
git init -q sources
cd sources
git remote add origin "$REPO"
git config core.sparseCheckout true
cat > .git/info/sparse-checkout <<'EOF'
models/quaternius/anim_lib/UAL1_Standard.glb
models/quaternius/anim_lib/UAL2_Standard.glb
models/quaternius/base/
models/quaternius/hair/
models/quaternius/parts/
EOF
git fetch -q --depth 1 --filter=blob:none origin "$COMMIT"
git -c gc.auto=0 checkout -q FETCH_HEAD
echo "sources ready in $(pwd)/models/quaternius"
