#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
command -v node >/dev/null || { echo '请先安装 Node.js 22 或更新版本'; exit 1; }
command -v uv >/dev/null || { echo '请先安装 uv：https://docs.astral.sh/uv/'; exit 1; }
if [ ! -x backend/.venv/bin/python ]; then uv venv --python 3.12 backend/.venv; fi
uv pip install --python backend/.venv/bin/python -r backend/requirements-dev.lock
(cd frontend && npm ci)
echo '依赖已安装。运行 ./scripts/dev.sh 启动。'
