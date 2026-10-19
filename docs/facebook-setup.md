# Connect Partly to Facebook

This is a **local development setup** for publishing Reels to a Facebook Page you manage. It does not support publishing to personal profiles.

## 1. Create a Meta app

1. Sign in to [Meta for Developers](https://developers.facebook.com/apps/) using the Facebook account that manages your Page.
2. Create a Meta app using a use case that supports Facebook Login and Page management.
3. In the app dashboard, copy the **App ID** and **App Secret** from the app's basic settings. Treat the App Secret like a password.
4. While testing in Development mode, make sure your Facebook account is assigned an app role (administrator, developer, or tester) if Meta requires one for your app configuration.

## 2. Configure Facebook Login

Configure Facebook Login for the Web, enable Client OAuth Login and Web OAuth Login if those settings are shown, and enter this exact development callback URI under Valid OAuth Redirect URIs:

```text
http://localhost:8000/auth/facebook/callback
```

Partly starts its server on localhost port 8000 by default. If you change host or port, update `FACEBOOK_REDIRECT_URI` in your `.env` and update Meta's registered redirect URI so the values match exactly.

## 3. Set up the local project

Install Python 3.11+ and FFmpeg/FFprobe. In PowerShell, clone the project and run its helper:

```powershell
git clone https://github.com/adii87s/Facebook-Video-Splitter.git
cd Facebook-Video-Splitter
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\run_windows.ps1
```

On first run, the script creates `.env` from `.env.example` and opens it in Notepad. Put your own values in these lines:

```dotenv
FACEBOOK_APP_ID=your_actual_app_id
FACEBOOK_APP_SECRET=your_actual_app_secret
FACEBOOK_REDIRECT_URI=http://localhost:8000/auth/facebook/callback
META_GRAPH_API_VERSION=v26.0
```

Save and close Notepad. The script then starts the app at http://localhost:8000. The same instructions are available at http://localhost:8000/setup.

If `.env` already exists and you change its values, stop the server with Ctrl+C and start it again so Python reloads the configuration.

## 4. Connect your Page and start uploads

1. Open http://localhost:8000.
2. Click **Connect Facebook**. Facebook opens its own authorization screen.
3. Review and approve the requested permissions.
4. Select a Page in the destination dropdown. Only Pages returned by Meta for your signed-in account can be selected.
5. Upload a rights-cleared video. Partly creates numbered 9:16 clips of up to 60 seconds.
6. Click **Publish all clips in order**, or select **Automatically publish when splitting finishes** first. With that option checked, the app queues publishing after a successful split, once a Page is selected.

The publisher processes the clips sequentially and stops on the first error. The UI says **submitted** when Facebook accepts the publish request; this does not guarantee Meta's separate video processing phase has finished.

## Permissions and App Review

Partly requests:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

Facebook Page publishing is governed by Meta's permissions, Page access rules, app mode, and review requirements. An app in Development mode is for testing with app roles. If other people will use the integration, verify Meta's current App Review and Advanced Access requirements before making the app public.

## Common issues

- **Redirect URI mismatch:** the registered redirect URI and `FACEBOOK_REDIRECT_URI` must match exactly.
- **No Pages found:** confirm the Facebook account has content-creation access to at least one Page and reauthorize the app.
- **Permission error:** verify the three Page permissions in the Meta app and check whether the current user is an app role.
- **FFmpeg not found:** install FFmpeg/FFprobe and ensure both are on PATH, then open a new PowerShell window.
- **Publishing fails:** test with a short MP4 (4–60 seconds) and review the error shown for the failed part.

## Keep secrets private

Never commit the real `.env` file, paste the App Secret into a chat or issue, or expose this local server to the public internet. `.env` and the runtime `data/` directory are ignored by Git. Local Page access tokens are encrypted in the local SQLite database.