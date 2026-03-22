import re
import threading
import sys
import time

try:
    import customtkinter as ctk
    from pywinauto import Desktop
    import requests
except ImportError:
    print("CRITICAL ERROR: Missing libraries.")
    print("Please run: pip install pywinauto customtkinter requests")
    sys.exit(1)

# --- Configuration ---
# Updated with a more forgiving regex to catch all dash/space variations
REGEX_PATTERN = r"aram-hanich[-_ ]*(\d+)"

# --- GUI Setup ---
ctk.set_appearance_mode("System")  # Follows Windows Dark/Light mode
ctk.set_default_color_theme("blue")

class TeamsScannerApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Teams Attendance Scanner")
        self.geometry("450x550")
        self.resizable(False, False)

        # State variable for continuous scanning
        self.is_scanning = False

        # Header
        self.header_label = ctk.CTkLabel(self, text="Auto Scanner", font=ctk.CTkFont(size=28, weight="bold"))
        self.header_label.pack(pady=(20, 5))

        self.sub_label = ctk.CTkLabel(self, text="Syncs live participants to web dashboard", text_color="gray")
        self.sub_label.pack(pady=(0, 20))

        # Instructions Frame
        self.inst_frame = ctk.CTkFrame(self)
        self.inst_frame.pack(pady=10, padx=20, fill="x")
        
        # Updated Instructions
        instructions = (
            "1. Open your active Microsoft Teams meeting.\n"
            "2. Open the 'People' (Participants) pane.\n"
            "3. Scroll to the bottom and click See More."
        )
        self.inst_label = ctk.CTkLabel(self.inst_frame, text=instructions, justify="left")
        self.inst_label.pack(pady=10, padx=10)

        # Server Settings Frame
        self.settings_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.settings_frame.pack(pady=10, padx=20, fill="x")

        self.url_entry = ctk.CTkEntry(self.settings_frame, placeholder_text="Server URL (e.g. http://localhost:3000)")
        self.url_entry.insert(0, "http://localhost:3000")
        self.url_entry.pack(fill="x", pady=5)

        self.pwd_entry = ctk.CTkEntry(self.settings_frame, placeholder_text="Server Password", show="*")
        self.pwd_entry.pack(fill="x", pady=5)

        # Toggle Button
        self.scan_btn = ctk.CTkButton(self, text="Scan & Sync", command=self.toggle_scan, height=40, font=ctk.CTkFont(weight="bold"))
        self.scan_btn.pack(pady=15, padx=20, fill="x")

        # Live Count Display
        self.count_label = ctk.CTkLabel(self, text="--", font=ctk.CTkFont(size=72, weight="bold"), text_color="#4f46e5")
        self.count_label.pack(pady=(10, 0))
        
        self.count_sub_label = ctk.CTkLabel(self, text="Students Found", font=ctk.CTkFont(size=14), text_color="gray")
        self.count_sub_label.pack(pady=(0, 10))

        # Status Label
        self.status_label = ctk.CTkLabel(self, text="Ready.", font=ctk.CTkFont(weight="bold"))
        self.status_label.pack(pady=10)

        # Store default colors for restoring later
        self.default_btn_fg = self.scan_btn.cget("fg_color")
        self.default_btn_hover = self.scan_btn.cget("hover_color")

    def log_status(self, message, is_error=False):
        """Thread-safe status update"""
        color = "#ef4444" if is_error else "white"
        self.after(0, lambda: self.status_label.configure(text=message, text_color=color if is_error else ("black", "white")))

    def update_count(self, count):
        """Thread-safe UI update for the big number"""
        self.after(0, lambda: self.count_label.configure(text=str(count)))

    def toggle_scan(self):
        """Handles the Start/Stop toggle logic for the button"""
        if not self.is_scanning:
            # Start Scanning
            url = self.url_entry.get().strip()
            pwd = self.pwd_entry.get().strip()

            if not url or not pwd:
                self.log_status("Please enter the server URL and password!", is_error=True)
                return

            self.is_scanning = True
            self.scan_btn.configure(text="Stop", fg_color="#ef4444", hover_color="#dc2626")
            self.log_status("Connecting to Teams... ⏳")
            self.update_count("--")
            
            # Run scraping and syncing in a background thread
            threading.Thread(target=self.run_automation, args=(url, pwd), daemon=True).start()
        else:
            # Stop Scanning
            self.is_scanning = False
            self.scan_btn.configure(text="Scan & Sync", fg_color=self.default_btn_fg, hover_color=self.default_btn_hover)
            self.log_status("Scanner stopped.", is_error=False)

    def _send_payload(self, url, pwd, status, message, present_ids):
        """Helper to send data securely to the central web server."""
        payload = {
            "password": pwd,
            "status": status,
            "message": message,
            "present_ids": present_ids
        }
        
        api_endpoint = f"{url.rstrip('/')}/api/sync-scanner"
        
        try:
            response = requests.post(api_endpoint, json=payload, timeout=5)
            data = response.json()
            if response.status_code == 200 and data.get("success"):
                self.log_status("Sync successful! Web page updated. ✅")
            else:
                self.log_status(f"Server rejected: {data.get('message', 'Unauthorized')}", is_error=True)
        except requests.exceptions.RequestException:
            self.log_status("Failed to reach server. Check URL.", is_error=True)

    def run_automation(self, url, pwd):
        # Initial connection message
        self._send_payload(url, pwd, "starting", "Remote scanner connected...", [])

        while self.is_scanning:
            try:
                # Re-initialize Desktop each loop to ensure a fresh UI tree
                desktop = Desktop(backend="uia")
                teams_windows = []
                
                # Scan active windows to find Teams using the old working logic
                for win in desktop.windows(visible_only=True):
                    title = win.window_text()
                    class_name = win.class_name()
                    if title and "Teams" in title and "Console" not in class_name and "CASCADIA" not in class_name:
                        teams_windows.append(win)

                if not teams_windows:
                    self.log_status("Teams window not found. Waiting...", is_error=True)
                    self._send_payload(url, pwd, "waiting", "Waiting for Teams window...", [])
                else:
                    self.log_status("Scanning participants... ⚙️")
                    
                    # Extract Text from ALL found Teams windows (fixes Main App vs Meeting split)
                    found_texts = set()
                    for win in teams_windows:
                        try:
                            for element in win.descendants():
                                try:
                                    # UIA often splits text between these two properties
                                    t1 = element.window_text()
                                    t2 = element.element_info.name
                                    if t1: found_texts.add(t1)
                                    if t2: found_texts.add(t2)
                                except Exception:
                                    continue
                        except Exception:
                            continue

                    # Filter logic
                    present_ids = set()
                    for text in found_texts:
                        match = re.search(REGEX_PATTERN, text, re.IGNORECASE)
                        if match:
                            present_ids.add(int(match.group(1)))

                    present_list = list(present_ids)
                    self.update_count(len(present_list))

                    # Send to Backend API
                    self.log_status("Syncing with server... 🌐")
                    self._send_payload(url, pwd, "scanning", f"Auto-scanner found {len(present_list)} students.", present_list)

                # Wait 3 seconds before the next scan, checking for interrupt
                for _ in range(30):
                    if not self.is_scanning:
                        break
                    time.sleep(0.1)

            except Exception as e:
                self.log_status(f"Critical Error: {str(e)}", is_error=True)
                time.sleep(3) # Throttle errors
        
        # Once the loop breaks (Stopped), send an offline status
        self._send_payload(url, pwd, "error", "Remote scanner offline.", [])

if __name__ == "__main__":
    app = TeamsScannerApp()
    app.mainloop()