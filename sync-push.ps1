# Sync Push - Save and push updates to GitHub
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  HPD App - Saving & Pushing Changes" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

$msg = Read-Host "Enter commit message (or press ENTER for default 'Sync updates')"
if ([string]::IsNullOrWhiteSpace($msg)) { $msg = "Sync updates" }

git add .
git commit -m "$msg"
git push origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nSuccessfully pushed changes to GitHub!" -ForegroundColor Green
} else {
    Write-Host "`nError pushing to GitHub." -ForegroundColor Red
}
