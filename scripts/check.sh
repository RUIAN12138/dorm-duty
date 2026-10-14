#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$TASK_ROOT/backend"
.venv/bin/ruff check app tests alembic
.venv/bin/pytest -q
cd ../frontend
npm run typecheck
npx tsc -p tsconfig.sw.json
npm run build
