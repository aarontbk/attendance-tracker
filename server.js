const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs'); // Added for secure password hashing

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// 1. Load sensitive configuration securely
let config;
try {
    const configPath = path.join(__dirname, 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
    console.error("CRITICAL ERROR: Could not find or read config.json");
    process.exit(1);
}

const studentsData = config.students;
const HASHED_PASSWORD = config.password;

// --- Security Helper ---
// If you haven't hashed your password yet, this will help you.
// Compare the HASHED_PASSWORD to see if it's a valid bcrypt hash. 
// If it's too short, it's probably plain text.
if (!HASHED_PASSWORD.startsWith('$2a$') && HASHED_PASSWORD.length < 30) {
    console.log("--- SECURITY WARNING ---");
    console.log("Your password in config.json is stored in PLAIN TEXT.");
    console.log("Generating a secure hash for you now...");
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(HASHED_PASSWORD, salt);
    console.log("REPLACE your password in config.json with this string:");
    console.log(hash);
    console.log("------------------------");
}

// 2. Secure Login Endpoint (Now using async/await for bcrypt)
app.post('/api/login', async (req, res) => {
    try {
        const userPassword = req.body.password || "";
        
        // Compare the provided plain-text password with the stored hash
        const isMatch = await bcrypt.compare(userPassword, HASHED_PASSWORD);

        if (isMatch) {
            // STRIP NAMES BEFORE SENDING TO NETWORK
            const safeStudentsData = studentsData.map(student => ({
                id: student.id,
                group: student.group
            }));
            res.json({ success: true, students: safeStudentsData });
        } else {
            res.status(401).json({ success: false });
        }
    } catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ success: false });
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
    timerExpiresAt = Date.now() + TEN_MINUTES;
    inactivityTimer = setTimeout(() => {
        for (let id in attendanceState) {
            attendanceState[id].present = false;
            attendanceState[id].reason = '';
        }
        io.emit('stateUpdate', attendanceState);
        io.emit('systemToast', 'Session reset due to 10 minutes of inactivity.');
    }, TEN_MINUTES);
}

setInterval(() => {
    if (timerExpiresAt) {
        const remainingSeconds = Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000));
        io.emit('timerUpdate', remainingSeconds);
    }
}, 1000);

resetInactivityTimer();

// WebSockets
io.on('connection', (socket) => {
    socket.emit('stateUpdate', attendanceState);
    const remainingSeconds = Math.max(0, Math.ceil((timerExpiresAt - Date.now()) / 1000));
    socket.emit('timerUpdate', remainingSeconds);

    socket.on('updateStudent', ({ id, present, reason }) => {
        if (attendanceState[id]) {
            attendanceState[id].present = present;
            attendanceState[id].reason = reason;
            io.emit('stateUpdate', attendanceState);
            resetInactivityTimer();
        }
    });

    socket.on('markAll', (markAsPresent) => {
        const targetState = markAsPresent ? true : false;
        for (let i = 1; i <= studentsData.length; i++) {
            if (attendanceState[i]) {
                attendanceState[i].present = targetState;
                attendanceState[id] ? attendanceState[id].reason = '' : null;
                // Fix for the loop logic
                if (attendanceState[i]) attendanceState[i].reason = '';
            }
        }
        io.emit('stateUpdate', attendanceState);
        resetInactivityTimer();
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});