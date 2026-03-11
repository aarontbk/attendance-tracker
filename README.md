# 📊 Attendance Tracker (Real-Time)

A lightweight, high-performance attendance tracking application built with **Node.js** and **Socket.io** for seamless, multi-user coordination during meetings.

---

## ✨ Features

* **🔄 Real-Time Sync:** Every status change and timer update is broadcasted instantly to all connected clients. No refresh required.
* **🖱️ 2-State Toggle:** Simple UI logic to manage student presence:
    * **Red (Missing):** Default state. Tap once to turn Green.
    * **Green (Present):** Tap once to turn Red and enter a reason.
* **⏳ 10-Minute Auto-Reset:** To keep data fresh, the board automatically resets all students to "Missing" (Red) if no activity is detected for 10 minutes.
* **🇮🇱 Hebrew Privacy Reports:** Generates "Missing" lists in Hebrew format, omitting names to ensure privacy while maintaining utility.

---

## 🚀 Getting Started

Follow these steps to get your local instance up and running:

1. **Prerequisites:** Ensure you have [Node.js](https://nodejs.org/) installed.
2. **Installation:** Open your terminal in the project folder and run:
   `npm install express socket.io`
3. **Running the Server:** Launch the application by running:
   `node server.js`
4. **Access:** Open your browser and navigate to:
   `http://localhost:3000`

---

## 🛠️ Usage Guide

| Action | Result |
| :--- | :--- |
| **Tap Red Student** | Status changes to **Green** (Present). |
| **Tap Green Student** | Status changes to **Red** (Missing). A prompt will ask for a **Reason**. |
| **Sidebar (Right)** | Displays the "Missing List" formatted as: `[ID] - [Reason]`. |
| **Copy Button** | Instantly saves the formatted Hebrew report to your clipboard. |

---

## ⚠️ Important Notice

> [!IMPORTANT]
> **FILL ONLY AFTER CONNECTING TO THE TEAMS MEETING!**
> To ensure the most accurate data, do not begin the tracking process until the session has officially started.

---
*Built with ❤️ for efficient team management.*