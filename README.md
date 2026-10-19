# Partly — Local Video Cutter & Facebook Page Publisher

Partly runs on your Windows PC. Cut a long video into numbered portrait MP4 clips, preview them, then either download them or connect a Facebook Page you manage and publish the clips in order. Editing stays local; clips are sent to Meta only when you explicitly press **Publish all clips in order**.

## Features

- Select a video file or drag it into the app.
- **Split into parts:** choose a clip length from 5 to 300 seconds (60 seconds by default).
- **Cut a selected range:** choose the exact start and end time to keep one section.
- Preview the source video and each result.
- Output portrait 9:16 MP4 files with a blurred background behind landscape videos.
- Automatically add a small `PART` or `CLIP` label.
- Download clips individually or bundle all clips in one ZIP file.
- Connect a Facebook Page using Meta's OAuth flow.
- Select the destination Page and publish generated clips in sequence with a reusable caption template.
- Review publish progress and errors; publishing stops on the first failed clip and avoids reposting parts already accepted on retry.
- Keep source videos, generated output, Page tokens, and other local state on your own machine.

## Requirements

- Windows 10/11
- Python 3.11 or newer
- FFmpeg and FFprobe available on your `PATH`

Install FFmpeg if it is not installed:

```powershell
winget install --id Gyan.FFmpeg
```

After installation, open a new PowerShell window so the updated `PATH` is available.

## Run on Windows

Clone the repository and start the helper script:

```powershell
git clone https://github.com/adii87s/Facebook-Video-Splitter.git
cd Facebook-Video-Splitter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\run_windows.ps1
```

The script creates a Python virtual environment, installs the requirements, makes a local `.env` file if needed, and starts the app at <http://localhost:8000>. Facebook is optional for cutting; publishing requires your own Meta developer app credentials in `.env`.

Keep the PowerShell window open while using the tool.

## How to use

1. Open <http://localhost:8000>.
2. Add a video using the upload box or drag-and-drop.
3. Pick **Split into parts** and set the clip duration, or pick **Cut a selected range** and enter the start/end times in seconds.
4. Click **Create clips** or **Cut selected range**.
5. Preview the results. Download an individual MP4 or click **Download all clips (ZIP)**.
6. To publish, connect Facebook, choose a Page you manage, enter a caption template, and click **Publish all clips in order**. Partly asks for confirmation before creating posts.
7. If you prefer, download the clips and upload them manually anywhere you like.

The app reframes clips into vertical 9:16 MP4s. If you want landscape output without the vertical background, the video processor's FFmpeg filter can be adjusted.

## File storage and privacy

The app binds to `127.0.0.1` by default and processes videos on your computer. Uploaded sources, generated clips, the ZIP archive, the local SQLite database, and development secrets are stored in `data/`, which is excluded from Git. Do not commit your private `.env` file or expose this local app directly to the public internet.

Only edit and distribute video content you own or have permission to use.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pip install pytest
.\.venv\Scripts\python.exe -m compileall -q app tests
.\.venv\Scripts\python.exe -m pytest -q
```
