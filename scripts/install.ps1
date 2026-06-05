# scripts/install.ps1 — Versão Windows do install.sh
$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

Write-Host "-> Instalando dependencias (npm install)..." -ForegroundColor Cyan
if (Test-Path "package-lock.json") { npm ci } else { npm install }

if (-not (Test-Path ".env.local")) {
    Copy-Item ".env.example" ".env.local"
    Write-Host "-> .env.local criado. Edite com suas credenciais." -ForegroundColor Yellow
}

Write-Host "`nProximos passos:" -ForegroundColor Green
Write-Host "  1. Edite .env.local com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"
Write-Host "     e SUPABASE_SERVICE_ROLE_KEY."
Write-Host "  2. Execute supabase/schema.sql + supabase/migrations/*.sql no SQL Editor do Supabase."
Write-Host "  3. npm run dev"
