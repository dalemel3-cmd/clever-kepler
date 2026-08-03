# Sync Pull - Get latest updates from GitHub
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  HPD App - Pulling Latest Changes  " -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

git pull origin main
if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccessfully pulled latest changes!" -ForegroundColor Green
    Write-Host "Running npm install..." -ForegroundColor Yellow
    npm install
    Write-Host "`nEverything is up to date and ready!" -ForegroundColor Green
} else {
    Write-Host "`nError pulling from GitHub." -ForegroundColor Red
}
