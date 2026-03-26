const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    pingTimeout: 10000, 
    pingInterval: 5000  
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Serve project-level logo for the web UI (used by `public/index.html`).
app.get('/logo.jpeg', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo.jpeg'));
});

// Transparent background logo for the web UI (favicon + header).
app.get('/logo.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'logo.png'));
});

let config;
try {
    const configPath = path.join(__dirname, 'config.json');
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (err) {
    console.error("CRITICAL ERROR: Could not find or read config.json");
    process.exit(1);
}

const studentsData = config.students;

// 1. Simplified Login Endpoint (No password check)
app.post('/api/login', (req, res) => {
    const safeStudentsData = studentsData.map(student => ({
        id: student.id,
        group: student.group
    }));
    res.json({ success: true, students: safeStudentsData });
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

app.post('/api/sync-scanner', (req, res) => {
    const data = req.body;
    scannerStatus = { status: data.status, message: data.message };

    // If the scanner successfully found students, update the server state
    if (data.status === 'scanning') {
        let stateChanged = false;
        
        if (Array.isArray(data.present_ids)) {
            data.present_ids.forEach(studentId => {
                if (attendanceState[studentId] && attendanceState[studentId].present === false) {
                    attendanceState[studentId].present = true;
                    attendanceState[studentId].reason = '';
                    stateChanged = true;
                }
            });
        }

        // Removed left_ids processing to keep registered users present forever
        
        if (stateChanged) {
            io.emit('stateUpdate', attendanceState);
            resetInactivityTimer();
        }
    }
    
    io.emit('scannerStatus', scannerStatus);
    res.json({ success: true });
});

io.on('connection', (socket) => {
    socket.emit('stateUpdate', attendanceState);
    socket.emit('timerSync', timerExpiresAt);
    socket.emit('scannerStatus', scannerStatus);

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

// --- Local auto-scanner integration ---
let scannerProcess = null;
function startLocalScanner() {
    if (scannerProcess && !scannerProcess.killed) {
        console.log('[scanner] Already running.');
        return;
    }

    const scriptPath = path.join(__dirname, 'public', 'teams_attendance_scanner.py');
    if (!fs.existsSync(scriptPath)) {
        console.error(`[scanner] Script not found: ${scriptPath}`);
        return;
    }

    const url = process.env.SCANNER_URL || `http://localhost:${PORT}`;
    const pythonCmd = process.env.PYTHON || 'python';

    console.log(`[scanner] Starting local scanner: ${pythonCmd} "${scriptPath}" "${url}"`);
    scannerProcess = spawn(pythonCmd, [scriptPath, url], {
        windowsHide: true,
        stdio: 'inherit',
    });

    scannerProcess.on('exit', (code, signal) => {
        console.log(`[scanner] Exited (code=${code}, signal=${signal}).`);
        scannerProcess = null;
    });
}

// Type `run` in the server terminal to start the scanner in the background.
process.stdin.setEncoding('utf8');
process.stdin.on('data', (data) => {
    const cmd = String(data || '').trim().toLowerCase();
    if (cmd === 'run') startLocalScanner();
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});