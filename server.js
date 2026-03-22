const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { spawn } = require('child_process');
const readline = require('readline');

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

// --- TEAMS AUTO-SCANNER INTEGRATION ---
let scannerStatus = { status: "starting", message: "Starting scanner..." };

function startTeamsScanner() {
    console.log("Starting Python Teams Scanner...");
    // Spawn the python process
    const pythonProcess = spawn('python', ['teams_scanner.py']);
    
    // Read stdout line by line
    const rl = readline.createInterface({ input: pythonProcess.stdout });
    
    rl.on('line', (line) => {
        try {
            const data = JSON.parse(line);
            scannerStatus = data;
            
            // If the scanner successfully found students, update the server state
            if (data.status === 'scanning' && data.present_ids) {
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
            
        } catch (e) {
            console.error("Could not parse scanner output:", line);
        }
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Scanner Error: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Scanner process exited with code ${code}. Restarting in 5s...`);
        scannerStatus = { status: "error", message: "Scanner offline. Restarting..." };
        io.emit('scannerStatus', scannerStatus);
        setTimeout(startTeamsScanner, 5000); // Auto-restart if it crashes
    });
}

// Start the scanner in the background
startTeamsScanner();
// --------------------------------------

io.on('connection', (socket) => {
    socket.emit('stateUpdate', attendanceState);
    socket.emit('timerSync', timerExpiresAt);
    socket.emit('scannerStatus', scannerStatus); // Send initial scanner status

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