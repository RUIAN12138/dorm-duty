#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
command -v node >/dev/null || { echo '请先安装 Node.js 22 或更新版本'; exit 1; }
npm ci --ignore-scripts
(cd frontend && npm ci)
(cd site && npm ci)
echo 'Web 依赖已安装。运行 npm run web:dev 启动正式链路。'
