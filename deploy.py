"""
Deploy-Script: Builds ZIP and publishes to Chrome Web Store via API v2.

Usage:
  python deploy.py                 # Build + Upload + Publish
  python deploy.py --upload-only   # Build + Upload (no publish)
  python deploy.py --status        # Check current status

Required environment variables:
  CWS_CLIENT_ID       - OAuth2 Client ID
  CWS_CLIENT_SECRET   - OAuth2 Client Secret
  CWS_REFRESH_TOKEN   - OAuth2 Refresh Token
  CWS_PUBLISHER_ID    - Publisher ID from Developer Dashboard
  CWS_EXTENSION_ID    - Extension ID from Chrome Web Store
"""

import json
import os
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.abspath(__file__))
EXT_DIR = os.path.join(ROOT, "extension")
MANIFEST = os.path.join(EXT_DIR, "manifest.json")

OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token"
CWS_API_BASE = "https://chromewebstore.googleapis.com"


def get_env(name):
    value = os.environ.get(name)
    if not value:
        print(f"Error: Environment variable {name} is not set.")
        sys.exit(1)
    return value


def get_version():
    with open(MANIFEST, "r", encoding="utf-8") as f:
        return json.load(f)["version"]


def get_access_token(client_id, client_secret, refresh_token):
    """Exchange refresh token for a fresh access token."""
    data = urllib.parse.urlencode({
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }).encode()

    req = urllib.request.Request(OAUTH_TOKEN_URL, data=data, method="POST")

    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = json.loads(e.read().decode())
        if body.get("error") == "invalid_grant":
            print("=" * 60)
            print("REFRESH TOKEN EXPIRED OR REVOKED")
            print("")
            print("Renew it via OAuth Playground:")
            print("  https://developers.google.com/oauthplayground")
            print("")
            print("Then update the CWS_REFRESH_TOKEN secret in GitHub.")
            print("See: docs/workflow/chrome-web-store-deploy.md")
            print("=" * 60)
        else:
            print(f"Error obtaining access token ({e.code}): {body}")
        sys.exit(1)

    if "access_token" not in result:
        print(f"Error: Unexpected token response: {result}")
        sys.exit(1)

    return result["access_token"]


def api_url(publisher_id, extension_id, action=""):
    base = f"{CWS_API_BASE}/v2/publishers/{publisher_id}/items/{extension_id}"
    return f"{base}:{action}" if action else base


def upload_url(publisher_id, extension_id):
    return f"{CWS_API_BASE}/upload/v2/publishers/{publisher_id}/items/{extension_id}:upload"


def fetch_status(token, publisher_id, extension_id):
    """Fetch current extension status from the store."""
    url = api_url(publisher_id, extension_id, "fetchStatus")
    req = urllib.request.Request(url, method="GET")
    req.add_header("Authorization", f"Bearer {token}")

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Error fetching status ({e.code}): {body}")
        sys.exit(1)


def upload_zip(token, publisher_id, extension_id, zip_path):
    """Upload a ZIP file to Chrome Web Store."""
    url = upload_url(publisher_id, extension_id)

    with open(zip_path, "rb") as f:
        zip_data = f.read()

    req = urllib.request.Request(url, data=zip_data, method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/zip")
    req.add_header("x-goog-api-version", "2")

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Error uploading ({e.code}): {body}")
        sys.exit(1)


def publish(token, publisher_id, extension_id):
    """Publish the uploaded extension."""
    url = api_url(publisher_id, extension_id, "publish")
    req = urllib.request.Request(url, data=b"", method="POST")
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("x-goog-api-version", "2")

    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"Error publishing ({e.code}): {body}")
        sys.exit(1)


def build_zip(version):
    """Build extension ZIP using build.py logic."""
    import zipfile

    output = os.path.join(ROOT, f"AI Monitor v{version}.zip")
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
        for dirpath, dirnames, filenames in os.walk(EXT_DIR):
            for fn in filenames:
                full = os.path.join(dirpath, fn)
                arcname = os.path.relpath(full, EXT_DIR)
                zf.write(full, arcname)
    return output


def main():
    import urllib.parse

    args = sys.argv[1:]
    status_only = "--status" in args
    upload_only = "--upload-only" in args

    client_id = get_env("CWS_CLIENT_ID")
    client_secret = get_env("CWS_CLIENT_SECRET")
    refresh_token = get_env("CWS_REFRESH_TOKEN")
    publisher_id = get_env("CWS_PUBLISHER_ID")
    extension_id = get_env("CWS_EXTENSION_ID")

    version = get_version()
    print(f"Extension version: {version}")

    # Get access token
    print("Obtaining access token...")
    token = get_access_token(client_id, client_secret, refresh_token)
    print("Access token obtained.")

    if status_only:
        status = fetch_status(token, publisher_id, extension_id)
        print(json.dumps(status, indent=2))
        return

    # Build ZIP
    print("Building ZIP...")
    zip_path = build_zip(version)
    print(f"Built: {zip_path}")

    # Upload
    print("Uploading to Chrome Web Store...")
    result = upload_zip(token, publisher_id, extension_id, zip_path)
    print(f"Upload result: {json.dumps(result, indent=2)}")

    upload_state = result.get("uploadState")
    if upload_state not in ("SUCCESS", "SUCCEEDED", "IN_PROGRESS"):
        print(f"Upload failed with state: {upload_state}")
        sys.exit(1)

    if upload_only:
        print("Upload complete (--upload-only). Skipping publish.")
        return

    # Publish
    print("Publishing...")
    result = publish(token, publisher_id, extension_id)
    print(f"Publish result: {json.dumps(result, indent=2)}")
    print(f"v{version} submitted for review.")


if __name__ == "__main__":
    main()
