#requires -Version 5.1
<#
.SYNOPSIS
    Final Chunk 7 end-to-end verification for AutoClip AI on Windows PowerShell.
.DESCRIPTION
    1. Shuts down WSL so no WSL worker can claim jobs.
    2. Verifies .env has Windows paths and WHISPER_DEVICE=cpu.
    3. Starts Next.js dev server.
    4. Calls GET /api/system/health.
    5. Generates a short test video with FFmpeg.
    6. Uploads the video, starts the project.
    7. Runs npm run worker:once.
    8. Polls project status until COMPLETED/FAILED.
    9. Writes a final report.
#>
$ErrorActionPreference = 'Stop'

$ProjectRoot = 'D:\Krisna Taufik\Project Krisna\AiClipper'
$ReportPath = Join-Path $ProjectRoot '.kimchi\docs\chunk7-powershell-result.md'
$TestVideoPath = Join-Path $ProjectRoot 'storage\tmp\test_video_ps.mp4'
$BaseUrl = 'http://localhost:3000'

function Now {
    Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
}

function Report($line) {
    Add-Content -Path $ReportPath -Value $line
    Write-Host $line
}

# Reset report
Set-Content -Path $ReportPath -Value "# Chunk 7 Final Verification Report (Windows PowerShell)`n"
Report "$(Now) - Starting final verification..."

# 1. Shut down WSL so old WSL worker does not claim jobs
Report "$(Now) - Shutting down WSL..."
wsl --shutdown
Start-Sleep -Seconds 5

# 2. Verify .env
Report "$(Now) - Verifying .env..."
$EnvContent = Get-Content (Join-Path $ProjectRoot '.env') -Raw
$Required = @{
    'FFMPEG_PATH'    = 'C:/Users/USER/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe'
    'FFPROBE_PATH'   = 'C:/Users/USER/AppData/Local/Microsoft/WinGet/Links/ffprobe.exe'
    'PYTHON_PATH'    = 'C:/Users/USER/AppData/Local/Programs/Python/Python312/python.exe'
    'WHISPER_DEVICE' = 'cpu'
}
foreach ($k in $Required.Keys) {
    $expected = $Required[$k]
    $escaped = [regex]::Escape($expected)
    if ($EnvContent -match "(?m)^$k\s*=\s*$escaped\s*$") {
        Report "OK: $k = $expected"
    } else {
        Report "WARN: $k does not match expected '$expected'. Continuing anyway."
    }
}

# 3. Health check via direct Node import (avoids needing dev server up)
Report "$(Now) - Running environment health check..."
$HealthCheckFile = Join-Path $ProjectRoot '.kimchi\tmp\health-check.mjs'
$HealthOutFile = Join-Path $ProjectRoot '.kimchi\tmp\health-check.out'
$HealthErrFile = Join-Path $ProjectRoot '.kimchi\tmp\health-check.err'
$null = New-Item -ItemType Directory -Path (Split-Path $HealthCheckFile) -Force -ErrorAction SilentlyContinue
$HealthCheckScript = @'
import { validateEnvironment } from "../../lib/system/environmentValidator.mjs";
const result = await validateEnvironment();
console.log(JSON.stringify(result));
'@
Set-Content -Path $HealthCheckFile -Value $HealthCheckScript -Encoding UTF8 -NoNewline

Push-Location $ProjectRoot
try {
    $HealthProc = Start-Process -FilePath 'node' -ArgumentList '--env-file=.env', '.kimchi\tmp\health-check.mjs' -Wait -PassThru -NoNewWindow -RedirectStandardOutput $HealthOutFile -RedirectStandardError $HealthErrFile
    $HealthExit = $HealthProc.ExitCode
} finally {
    Pop-Location
}

$HealthOutput = Get-Content $HealthOutFile -Raw -ErrorAction SilentlyContinue
$HealthError = Get-Content $HealthErrFile -Raw -ErrorAction SilentlyContinue

if ($HealthExit -ne 0) {
    Report "FAIL: health check exited with code $HealthExit"
    Report 'Node stdout:'
    ($HealthOutput -split "`r?`n") | ForEach-Object { Report "  $_" }
    Report 'Node stderr:'
    ($HealthError -split "`r?`n") | ForEach-Object { Report "  $_" }
    exit 1
}

$HealthJson = ($HealthOutput -split "`r?`n") | Where-Object { $_ -match '^\s*\{' } | Select-Object -Last 1
try {
    $Health = $HealthJson | ConvertFrom-Json
    if ($Health.ok) {
        Report 'OK: /api/system/health would return ok=true'
    } else {
        Report 'FAIL: health check not OK'
        Report "Errors: $($Health.errors -join '; ')"
    }
} catch {
    Report 'FAIL: health check output was not valid JSON'
    Report "Exit code: $HealthExit"
    Report 'Node stdout:'
    ($HealthOutput -split "`r?`n") | ForEach-Object { Report "  $_" }
    Report 'Node stderr:'
    ($HealthError -split "`r?`n") | ForEach-Object { Report "  $_" }
    exit 1
}

# 4. Generate test video
Report "$(Now) - Generating 15s test video..."
$FfmpegPath = 'C:/Users/USER/AppData/Local/Microsoft/WinGet/Links/ffmpeg.exe'
& $FfmpegPath -y -f lavfi -i 'testsrc=duration=15:size=1280x720:rate=30' -f lavfi -i 'sine=frequency=1000:duration=15' -c:v libx264 -c:a aac -pix_fmt yuv420p $TestVideoPath 2>&1 | Out-Null
if (Test-Path $TestVideoPath) {
    Report "OK: test video created at $TestVideoPath"
} else {
    Report 'FAIL: test video not created'
    exit 1
}

# 5. Start dev server in background
Report "$(Now) - Starting Next.js dev server..."
$DevJob = Start-Job -ScriptBlock {
    Set-Location $using:ProjectRoot
    npm run dev 2>&1
}
Start-Sleep -Seconds 10

# 6. Test /api/system/health endpoint
Report "$(Now) - Calling GET /api/system/health..."
try {
    $EndpointHealth = Invoke-RestMethod -Uri "$BaseUrl/api/system/health" -Method GET -TimeoutSec 10
    $EndpointHealthJson = $EndpointHealth | ConvertTo-Json -Depth 5
    Report 'OK: /api/system/health returned:'
    Report '```json'
    Report $EndpointHealthJson
    Report '```'
} catch {
    Report "FAIL: /api/system/health error: $($_.Exception.Message)"
}

# 7. Upload video
Report "$(Now) - Uploading test video..."
try {
    $Form = @{
        file  = Get-Item -Path $TestVideoPath
        title = 'Chunk 7 PowerShell Test'
    }
    $UploadResp = Invoke-RestMethod -Uri "$BaseUrl/api/uploads/video" -Method POST -Form $Form -TimeoutSec 60
    $ProjectId = $UploadResp.data.projectId
    if (-not $ProjectId) { $ProjectId = $UploadResp.projectId }
    Report "OK: uploaded. projectId=$ProjectId"
    $UploadRespJson = $UploadResp | ConvertTo-Json -Depth 3
    Report "Upload response: $UploadRespJson"
} catch {
    Report "FAIL: upload error: $($_.Exception.Message)"
    Stop-Job $DevJob
    Remove-Job $DevJob
    exit 1
}

# 8. Start project
Report "$(Now) - Starting project $ProjectId..."
try {
    $StartResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$ProjectId/start" -Method POST -TimeoutSec 30
    Report "OK: start response: $($StartResp | ConvertTo-Json -Depth 3)"
} catch {
    Report "FAIL: start error: $($_.Exception.Message)"
    Stop-Job $DevJob
    Remove-Job $DevJob
    exit 1
}

# 9. Run worker
Report "$(Now) - Running worker:once..."
Set-Location $ProjectRoot
$WorkerOutput = npm run worker:once 2>&1
$WorkerOutput | ForEach-Object { Report "WORKER: $_" }

# 10. Poll status
Report "$(Now) - Polling project status..."
$MaxAttempts = 60
$Status = 'QUEUED'
for ($i = 0; $i -lt $MaxAttempts -and $Status -notin @('COMPLETED', 'PARTIAL_COMPLETED', 'FAILED'); $i++) {
    Start-Sleep -Seconds 5
    try {
        $StatusResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$ProjectId/status" -Method GET -TimeoutSec 10
        $Status = $StatusResp.data.status
        Report "Poll $($i + 1): status=$Status; current_step=$($StatusResp.data.currentStep)"
    } catch {
        Report "Poll $($i + 1): error $($_.Exception.Message)"
    }
}

# 11. Check clips
Report "$(Now) - Checking clips..."
try {
    $ClipsResp = Invoke-RestMethod -Uri "$BaseUrl/api/projects/$ProjectId/clips" -Method GET -TimeoutSec 10
    $Clips = $ClipsResp.data
    $ClipCount = if ($Clips) { $Clips.Count } else { 0 }
    Report "OK: clip count = $ClipCount"
    if ($ClipCount -gt 0) {
        $FirstClip = $Clips[0]
        Report "First clip: id=$($FirstClip.clipId); status=$($FirstClip.status); path=$($FirstClip.outputFilePath)"
        $OutputPath = Join-Path $ProjectRoot $FirstClip.outputFilePath
        if (Test-Path $OutputPath) {
            Report "OK: output file exists at $OutputPath"
        } else {
            Report "WARN: output file path not found at $OutputPath"
        }
    }
} catch {
    Report "FAIL: clips error: $($_.Exception.Message)"
}

# 12. Final status
Report "$(Now) - Final project status: $Status"
if ($Status -in @('COMPLETED', 'PARTIAL_COMPLETED') -and $ClipCount -gt 0) {
    $Final = 'PASSED'
} elseif ($Status -eq 'FAILED') {
    $Final = 'FAILED'
} else {
    $Final = 'PARTIAL'
}
Report "FINAL STATUS: $Final"

# Stop dev server
Stop-Job $DevJob
Remove-Job $DevJob

Report "$(Now) - Verification complete."
