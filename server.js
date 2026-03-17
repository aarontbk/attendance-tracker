const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

// FIX: Aggressively clean up ghost connections to prevent memory leaks
const io = new Server(server, {
    pingTimeout: 10000, // Disconnect if no response in 10s
    pingInterval: 5000  // Ping every 5s
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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

// Security Helper for plain text passwords
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

app.post('/api/login', async (req, res) => {
    try {
        const userPassword = req.body.password || "";
        const isMatch = await bcrypt.compare(userPassword, HASHED_PASSWORD);

        if (isMatch) {
            // STRIP NAMES: Backend sanitization is the only way to hide data from Inspect tab
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

let attendanceState = {};
studentsData.forEach(s => {
    attendanceState[s.id] = { present: false, reason: '' };
});

// --- Memory-Safe Inactivity Timeout Logic ---
let inactivityTimer;
let timerExpiresAt; 
const TEN_MINUTES = 10 * 60 * 1000;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    
    // Set expiration target
    timerExpiresAt = Date.now() + TEN_MINUTES;
    
    // FIX: Broadcast the SYNC time once. Let the client do the ticking to save RAM.
    io.emit('timerSync', timerExpiresAt);
    
    inactivityTimer = setTimeout(() => {
        for (let studentId in attendanceState) {
            attendanceState[studentId].present = false;
            attendanceState[studentId].reason = '';
        }
        io.emit('stateUpdate', attendanceState);
        io.emit('systemToast', 'Session reset due to 10 minutes of inactivity.');
    }, TEN_MINUTES);
}

// FIX: Removed the 1-second setInterval loop that was causing memory bloat

resetInactivityTimer();

io.on('connection', (socket) => {
    socket.emit('stateUpdate', attendanceState);
    // Send the current target time to the new connection
    socket.emit('timerSync', timerExpiresAt);

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
        for (let studentId in attendanceState) {
            attendanceState[studentId].present = targetState;
            attendanceState[studentId].reason = ''; 
        }
        io.emit('stateUpdate', attendanceState);
        resetInactivityTimer(); 
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});