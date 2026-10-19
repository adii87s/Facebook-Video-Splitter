$ErrorActionPreference = 'Stop'

$Repo = 'adii87s/Facebook-Video-Splitter'
$ProjectPath = (Get-Location).Path
$TempPath = Join-Path $env:TEMP ("facebook-video-splitter-push-" + [guid]::NewGuid().ToString('N'))

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git was not found. Install Git for Windows first: https://git-scm.com/download/win'
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw 'GitHub CLI (gh) was not found. Install it with: winget install --id GitHub.cli'
}

gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw 'Sign in to GitHub first by running: gh auth login'
}

try {
  gh repo clone $Repo $TempPath
  if ($LASTEXITCODE -ne 0) { throw "Could not clone https://github.com/$Repo.git" }

  # Copy project sources but never copy local credentials, Git history, virtual
  # environments, generated clips, databases, or other local runtime data.
  robocopy $ProjectPath $TempPath /E /R:2 /W:1 /XD .git .venv data __pycache__ .pytest_cache .mypy_cache .ruff_cache /XF .env create_repo.ps1
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

  Push-Location $TempPath
  try {
    git add -A
    if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }
    $changes = git status --porcelain
    if ($changes) {
      git commit -m 'Add Facebook video splitter project'
      if ($LASTEXITCODE -ne 0) { throw 'git commit failed.' }
      git push origin main
      if ($LASTEXITCODE -ne 0) { throw 'git push failed.' }
    } else {
      Write-Host 'No changes to push.' -ForegroundColor Yellow
    }
  } finally {
    Pop-Location
  }
  Write-Host "Project pushed to https://github.com/$Repo" -ForegroundColor Green
} catch {
  Write-Host "Push failed. The temporary working copy is at: $TempPath" -ForegroundColor Yellow
  throw
}
