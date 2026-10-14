#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
[ -x backend/.venv/bin/python ] && [ -f frontend/node_modules/vite/bin/vite.js ] || { echo '请先运行 ./scripts/setup.sh'; exit 1; }
export JWT_SECRET="${JWT_SECRET:-$(backend/.venv/bin/python -c 'import secrets;print(secrets.token_urlsafe(48))')}"
# No secret file is created. Restart without an externally supplied secret requires signing in again.
cd backend
.venv/bin/alembic upgrade head
API_PID=''
WORKER_PID=''
FRONT_PID=''
cleanup() { for TASK_PID in "$API_PID" "$WORKER_PID" "$FRONT_PID"; do if [ -n "$TASK_PID" ]; then kill "$TASK_PID" 2>/dev/null || true; fi; done; }
trap cleanup EXIT
trap 'exit 130' INT TERM
.venv/bin/uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 &
API_PID=$!
.venv/bin/python -m app.scheduler &
WORKER_PID=$!
cd ../frontend
node node_modules/vite/bin/vite.js --host 0.0.0.0 --port 5173 &
FRONT_PID=$!
echo '网页：http://localhost:5173  API：http://localhost:8000/docs'
echo '手机业务调试：使用本机局域网 IP:5173；PWA 推送需 HTTPS。Ctrl+C 停止服务。'
# Exit if any owned service fails, and stop the remaining children.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WORKER_PID" 2>/dev/null && kill -0 "$FRONT_PID" 2>/dev/null; do sleep 2; done
exit 1
