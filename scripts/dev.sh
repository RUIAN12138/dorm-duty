#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
echo 'scripts/dev.sh 已停用历史 FastAPI/Vite 多进程入口，转发到正式 Node/SQLite 链路。'
exec npm run web:dev
