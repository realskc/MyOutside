#!/usr/bin/env bash
# 部署到服务器（docs/future/web-version.md §6）。每次都要作者明确同意（AGENTS.md 红线 4）。
# 在作者的 Mac 上运行：打发布包 → 传到服务器 → 在服务器上启用（activate-release.sh）。
set -euo pipefail
host="${MYOUTSIDE_HOST:-ubuntu@myoutside.org}"
repo="$(cd "$(dirname "$0")/../../.." && pwd)"
ts="$(date +%Y%m%d-%H%M%S)"

node "$repo/apps/server/scripts/build-release.mjs"
ssh -o BatchMode=yes "$host" "mkdir -p myoutside-upload"
rsync -a --delete -e "ssh -o BatchMode=yes" "$repo/apps/server/dist-release/" "$host:myoutside-upload/$ts/"
ssh -o BatchMode=yes "$host" "sudo bash -s -- $ts" < "$repo/apps/server/scripts/activate-release.sh"
