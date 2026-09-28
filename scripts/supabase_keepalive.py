"""Read the public health row without accessing or modifying player data."""

import json
import os
import sys
import time
import urllib.error
import urllib.request


def main():
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    if not url.startswith("https://") or not key:
        sys.exit("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.")
    request = urllib.request.Request(
        f"{url}/rest/v1/service_health?select=id&id=eq.1&limit=1",
        headers={"apikey": key, "Accept": "application/json"},
    )
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                if json.loads(response.read(4096)) != [{"id": 1}]:
                    raise ValueError("Expected health row was not returned.")
            print("Database read succeeded. No player data was accessed or changed.")
            return
        except (urllib.error.URLError, ValueError, TimeoutError) as error:
            # Never print headers, credentials, or the server response body.
            detail = f"HTTP {error.code}" if isinstance(error, urllib.error.HTTPError) else type(error).__name__
            print(f"Database check attempt {attempt}/3 failed ({detail}).", file=sys.stderr)
            if attempt < 3:
                time.sleep(5 * attempt)
    sys.exit("Check Supabase availability and whether migration 005_service_health.sql was applied.")


if __name__ == "__main__":
    main()
