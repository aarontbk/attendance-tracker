# 📊 Attendance Tracker (Real-Time)

A high-performance attendance tracking application built with **Node.js** and **Socket.IO** for seamless coordination during meetings.
The system includes a secure backend, a real-time web interface, and an automated Python-based scanner for Microsoft Teams.

---

## 🚀 Core Features

* **Real-Time Synchronization**
  Instant status and timer updates across all connected clients using WebSockets.

* **Automated Teams Integration**
  Remote Python scanner detects participants via the Windows UI Automation API.

* **Data Privacy**
  Complete anonymity — only student IDs and group assignments are stored.

* **Secure Authentication**
  Password protection using `bcrypt` hashing for both web access and API synchronization.

* **Dynamic Reporting**
  One-click generation of Hebrew-formatted reports and image exports.

* **Inactivity Protection**
  Automatic session reset after **10 minutes** of inactivity to ensure data freshness.

---

## 🛠 Installation

### 1. Prerequisites

* Node.js (v16.0.0 or higher)
* Python 3.x (for the automated scanner)

---

### 2. Backend Setup

Install required dependencies:

```bash
npm install express socket.io bcryptjs
```

---

### 3. Scanner Setup (Client Side)

Install Python dependencies:

```bash
pip install pywinauto requests
```

---

## ⚙️ Configuration

Create a `config.json` file in the root directory (do **not** commit this file):

```json
{
  "password": "your_secure_password_hash",
  "students": [
    { "id": 1, "group": "bear" },
    { "id": 2, "group": "gummy" }
  ]
}
```

> ⚠️ **Important:**
> On first run, if a plain-text password is provided, the server will output a secure bcrypt hash in the console.
> Replace the plain-text password in `config.json` with that hash.

---

## ▶️ Usage Guide

### Running the Server

```bash
node server.js
```

Access the interface at:
👉 http://localhost:3000

---

### 🧑‍🏫 Manual Attendance

* 🔴 **Missing (Red)** → Tap a student ID to mark as **Present (Green)**
* 🟢 **Present (Green)** → Tap to mark as **Missing (Red)** and enter a reason

---

### 🤖 Automated Scanner

Run:

```bash
python teams_client_scanner.py
```

Then:

1. Enter the server URL
2. Enter the system password

> ✅ Ensure the **"People" pane** in Microsoft Teams is open for accurate detection.

---

## 📄 Reporting

Reports are generated in the following Hebrew format:

```
מצב"ה - [Time] [Date]
מצ"ל: [Total]
מצ"ן: [Present]
חסרים: [Missing]
פירוט:
[ID] - [Reason]

מגיש: [Leader ID]
```

**Export Options:**

* Copy as raw text
* Export as clean PNG (white background)

---

## ⚠️ Important Notice

* Start attendance tracking **only after joining the Teams meeting** for accurate results.
* The system automatically resets after **10 minutes of inactivity**.

---

## 💡 Summary

Built for efficient, real-time team management with a focus on:

* Speed ⚡
* Privacy 🔒
* Automation 🤖
