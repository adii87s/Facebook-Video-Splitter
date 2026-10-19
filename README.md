# Facebook Video Splitter

A local-first app for turning one video into a sequence of numbered, 60-second vertical clips and publishing them one at a time to a Facebook **Page** through Meta's official APIs.

## What is included

- Upload one video from the browser.
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

Open PowerShell in this folder:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Add your Meta app ID and secret to `.env`. For the Meta app, add this exact development redirect URL to Valid OAuth Redirect URIs:

`http://localhost:8000/auth/facebook/callback`

Then start the app:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Open <http://localhost:8000>.

If FFmpeg is not already installed, install it (for example, using `winget install Gyan.FFmpeg`) and open a new terminal so `PATH` refreshes.

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

The user authorizes in Meta's login dialog. The app exchanges the OAuth code server-side, obtains the managed Page list, encrypts Page access tokens at rest, and never handles the user's Facebook password. Keep `.env`, `data/`, and `.token_key` files private.

Meta references:

- [Facebook API collection in Meta's Postman workspace](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
- [Facebook Reels publishing API sample](https://github.com/fbsamples/Facebook-Reels-Publishing-API-Postman-Collection)
- [Meta for Developers](https://developers.facebook.com/)

## Configuration

See `.env.example`. Keep the development server bound to localhost. Do not expose it directly to the public internet; this starter is a single-user local app, not a hardened multi-user service.

## Data and cleanup

Generated clips, source videos, job metadata, the SQLite database, and locally generated secrets are stored in `data/`, which is ignored by Git. Remove that directory to clear local jobs and disconnect the saved Page tokens.
