import re
import sys
import time

try:
    import requests
    from pywinauto import Desktop
except ImportError as e:
    print("CRITICAL ERROR: Missing Python dependencies.", flush=True)
    print("Please run: pip install pywinauto requests", flush=True)
    print(f"Details: {e}", flush=True)
    raise


# Match Teams participant names like: "aram-hanich-123" or "aram-hanich 123"
REGEX_PATTERN = r"aram-hanich[-_ ]*(\d+)"


def log(msg):
    print(msg, flush=True)


def get_url(argv):
    # First arg is the server URL. Default to localhost.
    if len(argv) >= 2 and argv[1] and not argv[1].startswith("-"):
        return argv[1]
    return "http://localhost:3000"


def send_payload(url, password, status, message, present_ids, left_ids=None):
    payload = {
        "password": password,
        "status": status,
        "message": message,
        "present_ids": present_ids,
    }
    # Only include `left_ids` when explicitly provided.
    if left_ids is not None:
        payload["left_ids"] = left_ids

    api_endpoint = f"{url.rstrip('/')}/api/sync-scanner"
    try:
        res = requests.post(api_endpoint, json=payload, timeout=5)
        res.raise_for_status()
    except Exception as e:
        # We don't crash on transient issues; scanner will keep trying.
        log(f"[scanner] send_payload failed: {e}")


def main() -> int:
    url = get_url(sys.argv)

    # Server currently doesn't validate password, so default to empty.
    # If you later add server-side checks, we can extend this to read config.json.
    password = ""

    log(f"[scanner] Starting. Target server: {url}")
    send_payload(url, password, "starting", "Remote scanner connected...", [])

    while True:
        try:
            cycle_start = time.time()
            desktop = Desktop(backend="uia")

            # Scan active windows to find Teams
            teams_windows = []
            for win in desktop.windows(visible_only=True):
                try:
                    title = win.window_text()
                    class_name = win.class_name()
                    if title and "Teams" in title and "Console" not in class_name and "CASCADIA" not in class_name:
                        teams_windows.append(win)
                except Exception:
                    continue

            if not teams_windows:
                log("[scanner] Teams window not found. Waiting...")
                found_count = 0
                send_payload(
                    url,
                    password,
                    "waiting",
                    "Waiting for Teams window... (0 participants found)",
                    [],
                    left_ids=None,
                )
                log("[scanner] Found 0 participants (reported).")
            else:
                log("[scanner] Scanning participants...")
                found_texts = set()

                for win in teams_windows:
                    try:
                        for element in win.descendants():
                            try:
                                t1 = element.window_text()
                                t2 = element.element_info.name
                                if t1:
                                    found_texts.add(t1)
                                if t2:
                                    found_texts.add(t2)
                            except Exception:
                                continue
                    except Exception:
                        continue

                # Extract present IDs from visible texts
                present_ids = set()
                for text in found_texts:
                    match = re.search(REGEX_PATTERN, text, re.IGNORECASE)
                    if match:
                        present_ids.add(int(match.group(1)))

                # IMPORTANT:
                # Teams unloads non-visible participants, which can look like disconnects.
                # So we ONLY report currently visible present_ids and do NOT send left_ids.
                found_count = len(present_ids)
                send_payload(
                    url,
                    password,
                    "scanning",
                    f"Auto-scanner found {found_count} participants.",
                    list(present_ids),
                    left_ids=None,
                )
                log(f"[scanner] Found {found_count} participants (reported).")

            # Run about once per second regardless of scan duration.
            elapsed = time.time() - cycle_start
            time.sleep(max(0, 1.0 - elapsed))

        except KeyboardInterrupt:
            log("[scanner] Stopped by user (KeyboardInterrupt).")
            send_payload(url, password, "error", "Remote scanner offline.", [])
            return 0
        except Exception as e:
            log(f"[scanner] Critical Error: {e}")
            send_payload(url, password, "error", f"Remote scanner critical error: {e}", [])
            time.sleep(3)


if __name__ == "__main__":
    raise SystemExit(main())

