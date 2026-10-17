#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
command -v node >/dev/null || { echo '需要 Node.js 22.13 或更新版本。'; exit 1; }
command -v npm >/dev/null || { echo '需要 npm。'; exit 1; }
npm run web:verify
