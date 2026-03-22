import re
import time
import json
import sys
try:
    from pywinauto import Desktop
except ImportError:
    print(json.dumps({"status": "error", "message": "Missing pywinauto. Run: pip install pywinauto"}))
    sys.stdout.flush()
    sys.exit(1)

REGEX_PATTERN = r"aram-hanich(\d+)"

def get_teams_window():
    desktop = Desktop(backend="uia")
    for win in desktop.windows(visible_only=True):
        title = win.window_text()
        class_name = win.class_name()
        if title and "Teams" in title and "Console" not in class_name and "CASCADIA" not in class_name:
            return win
    return None

def scan_participants(window):
    found_ids = set()
    for element in window.descendants():
        try:
            text = element.window_text()
            if text:
                match = re.search(REGEX_PATTERN, text, re.IGNORECASE)
                if match:
                    found_ids.add(int(match.group(1)))
        except:
            continue
    return list(found_ids)

def main():
    print(json.dumps({"status": "starting", "message": "Initializing Teams Scanner..."}))
    sys.stdout.flush()
    
    while True:
        try:
            win = get_teams_window()
            if win:
                # Teams is open, scan the UI
                present_ids = scan_participants(win)
                print(json.dumps({"status": "scanning", "present_ids": present_ids, "message": f"Found {len(present_ids)} students"}))
            else:
                # Teams window not found, tell the server we are waiting
                print(json.dumps({"status": "waiting", "message": "Waiting for Teams window..."}))
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}))
        
        # Flush stdout so Node.js receives the JSON immediately
        sys.stdout.flush()
        
        # Wait 5 seconds before the next scan to prevent high CPU usage
        time.sleep(5)

if __name__ == "__main__":
    main()