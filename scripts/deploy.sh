#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# scripts/deploy.sh
# Faz build local + deploy para Vercel.
# Pré-requisito: `vercel login` e `vercel link` já feitos no repositório.
# Variáveis de ambiente:
#   - VERCEL_PROD=1  → deploy em produção (default: preview)
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "→ TypeScript check…"
npx tsc --noEmit

echo "→ Lint…"
npm run lint --silent || true

echo "→ Build…"
npm run build

if [ "${VERCEL_PROD:-0}" = "1" ]; then
  echo "→ Deploy production…"
  npx vercel deploy --prod --yes
else
  echo "→ Deploy preview…"
  npx vercel deploy --yes
fi
