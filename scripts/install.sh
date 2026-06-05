#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────
# scripts/install.sh
# Instala dependências, cria .env.local a partir de .env.example
# e (opcionalmente) executa o schema + migrations no Supabase.
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "→ Instalando dependências (npm ci)…"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "→ .env.local criado a partir de .env.example. Edite as credenciais antes de continuar."
fi

echo ""
echo "Próximos passos:"
echo "  1. Edite .env.local com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"
echo "     e SUPABASE_SERVICE_ROLE_KEY."
echo "  2. Execute supabase/schema.sql + migrations/*.sql no SQL Editor do Supabase."
echo "  3. npm run dev — http://localhost:3000"
echo ""
