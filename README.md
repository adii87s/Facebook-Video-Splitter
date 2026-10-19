# Facebook Video Splitter

A local-first app for turning one video into a sequence of numbered, 60-second vertical clips and publishing them one at a time to a Facebook **Page** through Meta's official APIs.

## What is included

- Upload one video from the browser.
- Optionally enable automatic publishing so the sequential Page upload begins immediately after a successful split.
- Split it into consecutive 60-second segments (the final segment can be shorter).
- Reframe each segment to a vertical 9:16 layout with a blurred background when the source is landscape.
- Burn a `PART 1`, `PART 2`, … badge into the top-right corner of each clip.
- Preview and download processed clips.
- Connect a Facebook account through Meta OAuth, select a Page you manage, and queue the clips for sequential Reel publishing.
- Store Page access tokens encrypted in a local SQLite database; never ask for or store a Facebook password.

## Important before publishing

1. Use this only for videos you own or have explicit permission to distribute. Uploading a copyrighted movie in parts can still violate copyright and Meta's policies.
2. Publishing is supported for Facebook Pages that you manage, not arbitrary personal profiles. Meta may require App Review / Advanced Access before other users can connect.
3. Meta's Reels publishing API has format and duration requirements. This app exports 9:16 MP4 clips up to 60 seconds; very short final fragments may be rejected by Facebook. Exact requirements and available Graph API versions can change, so check Meta's current docs and set `META_GRAPH_API_VERSION` to a version enabled for your app.
4. Do a first test with a short, rights-cleared sample video and a test Page before uploading a full-length source.

## Requirements

- Python 3.11 or newer
- FFmpeg **and** FFprobe installed and available on `PATH`
- A Meta developer app configured for Facebook Login with a valid OAuth redirect URI
- A Facebook Page on which the connected user has content-creation access

## Run on Windows

The easiest option is to run the Windows helper from PowerShell:

```powershell
git clone https://github.com/adii87s/Facebook-Video-Splitter.git
cd Facebook-Video-Splitter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\run_windows.ps1
```

On first run it creates `.env` from `.env.example`, opens it in Notepad, and starts the app after you save and close it. Fill in your own Meta `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` values. The in-app setup guide is at <http://localhost:8000/setup>.

For Meta, register this exact callback URI in Facebook Login's Valid OAuth Redirect URIs when the dashboard asks for it:

`http://localhost:8000/auth/facebook/callback`

If FFmpeg/FFprobe are not installed, install them (for example, using `winget install --id Gyan.FFmpeg`) and open a new terminal so `PATH` refreshes. If you change `.env` later, restart the server.

## GitHub repository

The public project repository is [adii87s/Facebook-Video-Splitter](https://github.com/adii87s/Facebook-Video-Splitter). To work on a local clone, install Git and GitHub CLI, authenticate with `gh auth login`, then run:

```powershell
git clone https://github.com/adii87s/Facebook-Video-Splitter.git
cd Facebook-Video-Splitter
```

Make changes, run the tests, then commit and push your branch:

```powershell
git add .
git commit -m "Describe your changes"
git push
```

## Meta app permissions and OAuth

The starter requests these Page permissions only:

- `pages_show_list` — list Pages managed by the user
- `pages_read_engagement` — basic Page context needed by Page integrations
- `pages_manage_posts` — publish Page content

The user authorizes in Meta's login dialog. The app exchanges the OAuth code server-side, obtains the managed Page list, encrypts Page access tokens at rest, and never handles the user's Facebook password. Keep `.env` and `data/` private. The generated session and token encryption keys are stored under `data/`, which is ignored by Git.

Meta references:

- [Facebook API collection in Meta's Postman workspace](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
- [Facebook Reels publishing API sample](https://github.com/fbsamples/Facebook-Reels-Publishing-API-Postman-Collection)
- [Meta for Developers](https://developers.facebook.com/)

## Configuration

See `.env.example` and the [Facebook connection guide](docs/facebook-setup.md). Keep the development server bound to localhost. Do not expose it directly to the public internet; this starter is a single-user local app, not a hardened multi-user service.

## Data and cleanup

Generated clips, source videos, job metadata, the SQLite database, and locally generated secrets are stored in `data/`, which is ignored by Git. Remove that directory to clear local jobs and disconnect the saved Page tokens.
