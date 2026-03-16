const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🗄️ מסד נתונים הכולל את מאגר הקודים (PINs)
let db = { phonebooks: {}, savedGames: {}, pins: {} };
try { if (fs.existsSync('database.json')) db = JSON.parse(fs.readFileSync('database.json', 'utf8')); } catch(e) {}
function saveDB() { try { fs.writeFileSync('database.json', JSON.stringify(db)); } catch(e){} }

let rooms = {};
let phoneToRoom = {}; // 🧠 זיכרון - שומר איזה טלפון נמצא באיזה חדר

function getRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            activePlayers: {}, questions: [], currentQuestion: -1, gameActive: false, answersLocked: true,
            // 📞 עדכון המספר החדש שביקשת!
            gameSettings: { gameName: "קליקינט", phoneNumber: "077-2296674", isPremium: db.pins[roomId]?.type === 'premium' },
            calibrationState: 'off', calibrationStartTime: 0, questionStartTime: 0, timerTimeout: null
        };
        if (!db.phonebooks[roomId]) db.phonebooks[roomId] = {};
        if (!db.savedGames[roomId]) db.savedGames[roomId] = {};
        saveDB();
    }
    return rooms[roomId];
}

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));
app.get('/super', (req, res) => res.sendFile(__dirname + '/superadmin.html')); // 👑 מסך מנהל העל

app.post('/api/webhook/meshulam', (req, res) => {
    let roomId = req.body.custom1 || "default"; 
    let room = getRoom(roomId);
    if (req.body.status === '1' || req.body.status === 1) { 
        room.gameSettings.isPremium = true; io.to(roomId).emit('updateSettings', room.gameSettings); 
    }
    res.status(200).send("OK");
});

// 📞 מנוע התקשורת - עם לולאת 50 שניות שמונעת ניתוקים לנצח!
app.get('/api/answer', (req, res) => {
    try {
        const phone = req.query.ApiPhone || "unknown";
        let roomId = phoneToRoom[phone];

        // --- שלב 1: הילד עוד לא מחובר לאף חדר ---
        if (!roomId) {
            // בודקים אם הוא הקיש כעת קוד חדר (לתוך המשתנה התקני val_1)
            if (req.query.val_1 && req.query.val_1 !== '') {
                roomId = req.query.val_1;
                
                if (!db.pins[roomId]) {
                    return res.send("id_list_message=t-קוד המשחק אינו קיים במערכת. להתראות&go_to_folder=hangup");
                }
                if (db.pins[roomId].gamesLeft <= 0) {
                    return res.send("id_list_message=t-קוד זה סיים את מכסת המשחקים. להתראות&go_to_folder=hangup");
                }

                phoneToRoom[phone] = roomId; 
                const room = getRoom(roomId);
                
                if (!room.activePlayers[phone]) {
                    if (!room.gameSettings.isPremium && Object.keys(room.activePlayers).length >= 10) {
                        return res.send("id_list_message=t-המשחק החינמי מלא. פנה למפיק&go_to_folder=hangup"); 
                    }
                    room.activePlayers[phone] = { name: db.phonebooks[roomId][phone] || "שחקן חדש", score: 0, lastAnswered: -1, ping: 0 };
                    io.to(roomId).emit('updateLeaderboard', room.activePlayers);
                }
                
                // הילד בפנים! מעבירים אותו למשתנה המשחק (val_2) עם טיימר של 50 שניות כדי שלא יתנתק
                return res.send("read=t-מחובר בהצלחה. המתן לשאלה=val_2,no,1,0,50,No,No");
            } else {
                // רק עכשיו התקשר - נבקש קוד חדר
                return res.send("read=t-ברוכים הבאים לקליקינט. הקישו קוד משחק וסיום בסולמית=val_1,no,10,1,30,No,No");
            }
        }

        // --- שלב 2: הילד מחובר ומחכה בלולאה (val_2) ---
        const room = getRoom(roomId);
        let userChoice = req.query.val_2 || null;

        if (userChoice) {
            if (room.calibrationState === 'active') {
                room.activePlayers[phone].ping = Date.now() - room.calibrationStartTime; 
                io.to(roomId).emit('calibrationProgress', { count: Object.values(room.activePlayers).filter(p => p.ping > 0).length });
                return res.send("read=t-נקלט=val_2,no,1,0,50,No,No");
            }
            
            if (room.gameActive && !room.answersLocked && room.currentQuestion >= 0) {
                let q = room.questions[room.currentQuestion];
                if (room.activePlayers[phone].lastAnswered !== room.currentQuestion) {
                    room.activePlayers[phone].lastAnswered = room.currentQuestion;
                    room.activePlayers[phone].currentChoice = userChoice;
                    if (q.ans && userChoice === String(q.ans)) {
                        let netTime = Math.max(100, (Date.now() - room.questionStartTime) - (room.activePlayers[phone].ping || 0)); 
                        room.activePlayers[phone].score += Math.max(10, 1000 - Math.floor(netTime / 10));
                    }
                    io.to(roomId).emit('updateLeaderboard', room.activePlayers);
                }
                return res.send("read=t-תשובה נקלטה=val_2,no,1,0,50,No,No");
            }
            return res.send("read=t-נקלט=val_2,no,1,0,50,No,No");
        }

        // --- שלב 3: לולאת "פעימות הלב" (מונעת מימות המשיח לנתק!) ---
        if (room.calibrationState === 'prepared') {
            return res.send("read=t-היכונו=val_2,no,1,0,50,No,No");
        } else if (room.calibrationState === 'active') {
            return res.send("read=t-הקש 1 עכשיו=val_2,no,1,1,30,No,No");
        } else if (room.gameActive && !room.answersLocked) {
            return res.send("read=t-הקש את תשובתך=val_2,no,1,1,30,No,No");
        } else {
            // הילד פשוט ממתין: כל 50 שניות המערכת תגיד לו "ממתין", ותחזיר אותו ללולאה בלי לנתק!
            return res.send("read=t-ממתין=val_2,no,1,0,50,No,No");
        }

    } catch(err) {
        console.error(err);
        res.send("id_list_message=t-שגיאת מערכת&go_to_folder=hangup");
    }
});

io.on('connection', (socket) => {
    
    // 👑 --- פקודות מנהל העל (הכספת) ---
    socket.on('superLogin', (pass) => {
        if (pass === "Ahal2026!") { 
            socket.emit('superData', db.pins);
        } else {
            socket.emit('superError');
        }
    });

    socket.on('createPin', (data) => {
        db.pins[data.pin] = { type: data.type, gamesLeft: 3, created: new Date().toLocaleDateString('he-IL') };
        saveDB(); io.emit('superData', db.pins); 
    });

    socket.on('createBulkPins', (data) => {
        let start = parseInt(data.start);
        let end = parseInt(data.end);
        for(let i = start; i <= end; i++) {
            db.pins[i.toString()] = { type: data.type, gamesLeft: 3, created: new Date().toLocaleDateString('he-IL') };
        }
        saveDB(); io.emit('superData', db.pins); 
    });

    socket.on('deletePin', (pin) => { delete db.pins[pin]; saveDB(); io.emit('superData', db.pins); });

    // 🎛️ --- פקודות מפיק (Admin) ---
    socket.on('joinRoom', (roomId) => {
        if (!db.pins[roomId]) { socket.emit('loginResponse', { success: false, error: 'קוד משחק שגוי או שאינו קיים במערכת!' }); return; }
        if (db.pins[roomId].gamesLeft <= 0) { socket.emit('loginResponse', { success: false, error: 'נגמרה מכסת המשחקים לקוד זה!' }); return; }

        socket.join(roomId); socket.roomId = roomId; const room = getRoom(roomId);
        socket.emit('loginResponse', { success: true, gamesLeft: db.pins[roomId].gamesLeft });
        socket.emit('updateSettings', room.gameSettings); socket.emit('updateLeaderboard', room.activePlayers);
        socket.emit('lockState', room.answersLocked); socket.emit('updateQuestions', room.questions);
        socket.emit('updateSavedGames', Object.keys(db.savedGames[roomId] || {}));
    });

    socket.on('startGame', () => { 
        if(!socket.roomId) return; let room = rooms[socket.roomId]; if(room.questions.length === 0) return; 
        if (db.pins[socket.roomId] && db.pins[socket.roomId].gamesLeft > 0) {
            db.pins[socket.roomId].gamesLeft--; saveDB(); io.to(socket.roomId).emit('updateGamesLeft', db.pins[socket.roomId].gamesLeft);
        }
        room.gameActive = true; room.currentQuestion = 0; room.answersLocked = true; 
        for(let p in room.activePlayers) { room.activePlayers[p].score = 0; room.activePlayers[p].currentChoice = null; room.activePlayers[p].lastAnswered = -1; } 
        io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('updateLeaderboard', room.activePlayers); 
    });

    socket.on('saveSettings', s => { if(!socket.roomId) return; rooms[socket.roomId].gameSettings = s; io.to(socket.roomId).emit('updateSettings', s); });
    socket.on('triggerEffect', type => { if(socket.roomId) io.to(socket.roomId).emit('playEffect', type); });
    socket.on('changeBackground', bg => { if(socket.roomId) io.to(socket.roomId).emit('setBg', bg); });
    socket.on('prepareCalibration', () => { if(!socket.roomId) return; rooms[socket.roomId].calibrationState = 'prepared'; for(let p in rooms[socket.roomId].activePlayers) rooms[socket.roomId].activePlayers[p].ping = 0; io.to(socket.roomId).emit('prepareCalibration'); });
    socket.on('startCalibration', () => { if(!socket.roomId) return; rooms[socket.roomId].calibrationState = 'active'; rooms[socket.roomId].calibrationStartTime = Date.now(); io.to(socket.roomId).emit('startCalibration'); });
    socket.on('endCalibration', () => { if(!socket.roomId) return; rooms[socket.roomId].calibrationState = 'off'; let pings = Object.values(rooms[socket.roomId].activePlayers).filter(p => p.ping > 0).map(p => p.ping); let stats = { count: pings.length, avg: 0, min: 0, max: 0 }; if(pings.length > 0) { stats.avg = Math.round(pings.reduce((a,b)=>a+b,0)/pings.length); stats.min = Math.min(...pings); stats.max = Math.max(...pings); } io.to(socket.roomId).emit('endCalibration', stats); });
    socket.on('updatePlayerName', ({ phone, newName }) => { if(!socket.roomId) return; db.phonebooks[socket.roomId][phone] = newName; saveDB(); if (rooms[socket.roomId].activePlayers[phone]) rooms[socket.roomId].activePlayers[phone].name = newName; io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers); });
    socket.on('addSingleQuestion', q => { if(!socket.roomId) return; rooms[socket.roomId].questions.push(q); io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); });
    socket.on('clearQuestions', () => { if(!socket.roomId) return; rooms[socket.roomId].questions = []; io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); });
    socket.on('saveGameToBank', name => { if(!socket.roomId) return; db.savedGames[socket.roomId][name] = [...rooms[socket.roomId].questions]; saveDB(); io.to(socket.roomId).emit('updateSavedGames', Object.keys(db.savedGames[socket.roomId])); });
    socket.on('loadGameFromBank', name => { if(!socket.roomId) return; if (db.savedGames[socket.roomId][name]) { rooms[socket.roomId].questions = [...db.savedGames[socket.roomId][name]]; io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('deleteGameFromBank', name => { if(!socket.roomId) return; delete db.savedGames[socket.roomId][name]; saveDB(); io.to(socket.roomId).emit('updateSavedGames', Object.keys(db.savedGames[socket.roomId])); });
    socket.on('toggleLock', lock => { if(!socket.roomId) return; rooms[socket.roomId].answersLocked = lock; if(lock && rooms[socket.roomId].timerTimeout) clearTimeout(rooms[socket.roomId].timerTimeout); io.to(socket.roomId).emit('lockState', rooms[socket.roomId].answersLocked); });
    socket.on('startTimer', sec => { if(!socket.roomId) return; let room = rooms[socket.roomId]; room.answersLocked = false; room.questionStartTime = Date.now(); io.to(socket.roomId).emit('lockState', false); io.to(socket.roomId).emit('startCountdown', sec); if(room.timerTimeout) clearTimeout(room.timerTimeout); room.timerTimeout = setTimeout(() => { room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('playEffect', 'shake'); }, sec * 1000); });
    socket.on('nextQuestion', () => { if(!socket.roomId) return; let room = rooms[socket.roomId]; room.currentQuestion++; if (room.currentQuestion < room.questions.length) { room.answersLocked = true; for(let p in room.activePlayers) room.activePlayers[p].currentChoice = null; io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); } else { room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('gameOver'); } });
    socket.on('showVictoryScreen', () => { if(!socket.roomId) return; let room = rooms[socket.roomId]; room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); const topPlayers = Object.values(room.activePlayers).sort((a,b) => b.score - a.score).slice(0, 3); io.to(socket.roomId).emit('victoryPodium', topPlayers); });
    socket.on('clearPlayers', () => { if(!socket.roomId) return; rooms[socket.roomId].activePlayers = {}; io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V34.0 (Anti-Disconnect Loop Enabled) is ONLINE ==="));
