const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    pingTimeout: 10000, 
    pingInterval: 5000  
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

// 1. UI Login Endpoint
app.post('/api/login', async (req, res) => {
    try {
        const userPassword = req.body.password || "";
        const isMatch = await bcrypt.compare(userPassword, HASHED_PASSWORD);

        if (isMatch) {
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

let inactivityTimer;
let timerExpiresAt; 
const TEN_MINUTES = 10 * 60 * 1000;

function resetInactivityTimer() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    timerExpiresAt = Date.now() + TEN_MINUTES;
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

resetInactivityTimer();

// --- REMOTE AUTO-SCANNER API ENDPOINT ---
let scannerStatus = { status: "waiting", message: "Waiting for remote scanner..." };

app.post('/api/sync-scanner', async (req, res) => {
    try {
        // Authenticate the incoming scanner request
        const userPassword = req.body.password || "";
        const isMatch = await bcrypt.compare(userPassword, HASHED_PASSWORD);
        
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Unauthorized Scanner" });
        }

        const data = req.body;
        scannerStatus = { status: data.status, message: data.message };

        // If the scanner successfully found students, update the server state
        if (data.status === 'scanning' && Array.isArray(data.present_ids)) {
            let stateChanged = false;
            
            data.present_ids.forEach(studentId => {
                // Only update if they were previously marked missing
                if (attendanceState[studentId] && attendanceState[studentId].present === false) {
                    attendanceState[studentId].present = true;
                    attendanceState[studentId].reason = '';
                    stateChanged = true;
                }
            });
            
            // If anyone new was found, broadcast the update
            if (stateChanged) {
                io.emit('stateUpdate', attendanceState);
                resetInactivityTimer();
            }
        }
        
        // Broadcast the scanner's health status to the UI
        io.emit('scannerStatus', scannerStatus);
        res.json({ success: true });

    } catch (error) {
        console.error("Scanner sync error:", error);
        res.status(500).json({ success: false });
    }
});
// ----------------------------------------

io.on('connection', (socket) => {
    socket.emit('stateUpdate', attendanceState);
    socket.emit('timerSync', timerExpiresAt);
    socket.emit('scannerStatus', scannerStatus); // Send current scanner status

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