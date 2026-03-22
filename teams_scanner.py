import re
import time
import sys
try:
    import requests
    from pywinauto import Desktop
except ImportError:
    print("CRITICAL ERROR: Missing required libraries.")
    print("Please open your terminal and run:")
    print("pip install pywinauto requests")
    sys.exit(1)

REGEX_PATTERN = r"aram-hanich(\d+)"

def get_teams_window():
    """Hooks into the local Teams meeting window."""
    desktop = Desktop(backend="uia")
    for win in desktop.windows(visible_only=True):
        title = win.window_text()
        class_name = win.class_name()
        if title and "Teams" in title and "Console" not in class_name and "CASCADIA" not in class_name:
            return win
    return None

def scan_participants(window):
    """Scans the Teams UI tree for matching student IDs."""
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

def send_to_server(url, password, status, message, present_ids=None):
    """Sends the scanned data securely to the central web server."""
    if present_ids is None:
        present_ids = []
        
    payload = {
        "password": password,
        "status": status,
        "message": message,
        "present_ids": present_ids
    }
    
    endpoint = f"{url.rstrip('/')}/api/sync-scanner"
    
    try:
        response = requests.post(endpoint, json=payload, timeout=5)
        if response.status_code == 401:
            print("[-] Server rejected connection: Incorrect Password.")
            sys.exit(1)
        elif response.status_code != 200:
            print(f"[-] Server returned error code: {response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"[-] Connection to server failed: {e}")

def main():
    print("="*60)
    print(" Remote Teams Attendance Scanner (Client-to-Server) ")
    print("="*60)
    print("This script will scan your local Teams window and")
    print("send the data automatically to the main web server.")
    print("")
    
    # Get server details from the user
    server_url = input("Enter Server URL (e.g., http://localhost:3000): ").strip()
    if not server_url.startswith("http"):
        server_url = "http://" + server_url
        
    server_password = input("Enter the System Password: ").strip()
    
    print("\n[+] Starting background scan. Keep the Teams 'People' pane open!")
    print("    Press Ctrl+C to stop the scanner.\n")
    
    send_to_server(server_url, server_password, "starting", "Remote scanner connected...")
    
    try:
        while True:
            win = get_teams_window()
            if win:
                # Teams is open, scan the UI
                present_ids = scan_participants(win)
                msg = f"Scanning: Found {len(present_ids)} students"
                print(f"[*] {msg}")
                send_to_server(server_url, server_password, "scanning", msg, present_ids)
            else:
                # Teams window not found
                print("[-] Teams window not found. Waiting...")
                send_to_server(server_url, server_password, "waiting", "Waiting for Teams window...")
            
            # Wait 3 seconds before the next scan as requested
            time.sleep(3)
            
    except KeyboardInterrupt:
        print("\n[!] Scanner stopped by user.")
        send_to_server(server_url, server_password, "error", "Remote scanner offline.")
        sys.exit(0)

if __name__ == "__main__":
    main()