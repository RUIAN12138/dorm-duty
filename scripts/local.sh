#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT"
command -v node >/dev/null || { echo '需要 Node.js 22.13 或更新版本。'; exit 1; }
node -e "require('node:sqlite')" >/dev/null 2>&1 || { echo '当前 Node 不支持内置 SQLite，请使用 Node.js 22.13 或更新版本。'; exit 1; }
TASK_PORT="${DORM_LOCAL_PORT:-8081}"
TASK_URL="http://127.0.0.1:$TASK_PORT/"
TASK_HEALTH="$(curl -fsS --max-time 2 "$TASK_URL"health 2>/dev/null || true)"
if node -e 'try { const h=JSON.parse(process.argv[1]); const p=require("node:path").resolve(process.env.DORM_LOCAL_DATABASE || "data/dorm-local.db"); const id=require("node:crypto").createHash("sha256").update(p).digest("hex"); process.exit(h.application==="dorm-duty-local" && h.persistent===true && h.database_id===id ? 0 : 1); } catch { process.exit(1); }' "$TASK_HEALTH"; then
  if [[ "${1:-}" == '--open' ]]; then open "$TASK_URL"; fi
  echo "本地版已在运行：$TASK_URL"
  exit 0
fi
if [[ -n "$TASK_HEALTH" ]]; then
  echo "端口 $TASK_PORT 上已有其他服务；请先停止该服务或设置 DORM_LOCAL_PORT。"
  exit 1
fi
if [[ ! -f frontend/node_modules/vite/bin/vite.js ]]; then
  (cd frontend && npm ci)
fi
if [[ ! -f site/node_modules/esbuild/package.json ]]; then
  (cd site && npm ci)
fi
(cd frontend && npm run build)
node site/scripts/embed-frontend.mjs
if [[ "${1:-}" == '--open' ]]; then
  (
    for TASK_ATTEMPT in {1..30}; do
      if curl -fsS --max-time 1 "$TASK_URL"health >/dev/null 2>&1; then open "$TASK_URL"; exit 0; fi
      sleep 1
    done
  ) &
fi
exec node scripts/local-server.mjs
