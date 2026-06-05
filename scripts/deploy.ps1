# scripts/deploy.ps1 — Versão Windows do deploy.sh
$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

Write-Host "-> TypeScript check..." -ForegroundColor Cyan
npx tsc --noEmit

Write-Host "-> Lint..." -ForegroundColor Cyan
try { npm run lint --silent } catch { Write-Host "Lint warnings ignorados." -ForegroundColor Yellow }

Write-Host "-> Build..." -ForegroundColor Cyan
npm run build

if ($env:VERCEL_PROD -eq "1") {
    Write-Host "-> Deploy production..." -ForegroundColor Green
    npx vercel deploy --prod --yes
} else {
    Write-Host "-> Deploy preview..." -ForegroundColor Green
    npx vercel deploy --yes
}
