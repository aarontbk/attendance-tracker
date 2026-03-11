const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs'); // Added filesystem module

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json()); // Allow server to read JSON bodies for login

// 1. Load sensitive configuration securely
let config;
try {
    const configPath = path.join(__dirname, 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
    console.error("CRITICAL ERROR: Could not find or read config.json");
    console.error("Please make sure you created config.json in the same folder as server.js");
    process.exit(1); // Stop server if config is missing
}

const studentsData = config.students;
const APP_PASSWORD = config.password;

// 2. Secure Login Endpoint
app.post('/api/login', (req, res) => {
    if (req.body.password === APP_PASSWORD) {
        // Only send student names if password is correct
        res.json({ success: true, students: studentsData });
    } else {
        res.status(401).json({ success: false });
    }
});

// Setup Initial State
let attendanceState = {};
studentsData.forEach(s => {
    attendanceState[s.id] = { present: false, reason: '' };
});

// --- Inactivity Timeout Logic ---
let inactivityTimer;
let timerExpiresAt; 
const TEN_MINUTES = 10 * 60 * 1000;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    
    // Set the new expiration target 10 minutes from now
    timerExpiresAt = Date.now() + TEN_MINUTES;
    
    inactivityTimer = setTimeout(() => {
        console.log("Resetting all due to inactivity.");
        for (let id in attendanceState) {
            attendanceState[id].present = false; // Reset to red (missing)
            attendanceState[id].reason = '';
        }
        io.emit('stateUpdate', attendanceState);
        io.emit('systemToast', 'Session reset due to 10 minutes of inactivity.');
    }, TEN_MINUTES);
}

// Broadcast the exact remaining seconds every second
setInterval(() => {
    if (timerExpiresAt) {
        const remainingSeconds = Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000));
        io.emit('timerUpdate', remainingSeconds);
    }
}, 1000);

// Initialize timer on start
resetInactivityTimer();

// WebSockets
io.on('connection', (socket) => {
    // Sync current attendance state
    socket.emit('stateUpdate', attendanceState);
    
    // Send immediate timer state
    const remainingSeconds = Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000));
    socket.emit('timerUpdate', remainingSeconds);

    socket.on('updateStudent', ({ id, present, reason }) => {
        if (attendanceState[id]) {
            attendanceState[id].present = present;
            attendanceState[id].reason = reason;
            io.emit('stateUpdate', attendanceState);
            resetInactivityTimer(); // Activity detected
        }
    });

    socket.on('markAll', (markAsPresent) => {
        // Target false (red) if resetting
        const targetState = markAsPresent ? true : false;
        for (let i = 1; i <= studentsData.length; i++) {
            if (attendanceState[i]) {
                attendanceState[i].present = targetState;
                attendanceState[i].reason = ''; 
            }
        }
        io.emit('stateUpdate', attendanceState);
        resetInactivityTimer(); // Activity detected
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});