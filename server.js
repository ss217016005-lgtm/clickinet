const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🗄️ מסד נתונים יציב
let db = { phonebooks: {}, savedGames: {}, pins: {}, phoneToRoom: {} };
try { 
    if (fs.existsSync('database.json')) {
        let data = fs.readFileSync('database.json', 'utf8');
        if (data.trim() !== '') db = JSON.parse(data);
    }
} catch(e) {}

function saveDB() { try { fs.writeFileSync('database.json', JSON.stringify(db)); } catch(e){} }

let rooms = {};

function getRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            activePlayers: {}, questions: [], currentQuestion: -1, gameActive: false, answersLocked: true,
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
app.get('/super', (req, res) => res.sendFile(__dirname + '/superadmin.html')); 

app.post('/api/webhook/meshulam', (req, res) => {
    let roomId = req.body.custom1 || "default"; 
    let room = getRoom(roomId);
    if (req.body.status === '1' || req.body.status === 1) { 
        room.gameSettings.isPremium = true; io.to(roomId).emit('updateSettings', room.gameSettings); 
    }
    res.status(200).send("OK");
});

// 🛡️ מנוע התקשורת - הפתרון הסופי (לולאה שרשורית נקייה ללא קריסות)
app.get('/api/answer', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    try {
        const phone = req.query.ApiPhone || "unknown";
        let val1 = req.query.val_1;

        // 1. שלב הכניסה - הילד עוד לא מחובר לחדר
        if (!db.phoneToRoom[phone]) {
            if (val1 && val1 !== '') {
                if (!db.pins[val1]) return res.send(`id_list_message=t-קוד המשחק שגוי&go_to_folder=hangup`);
                if (db.pins[val1].gamesLeft <= 0) return res.send(`id_list_message=t-הקוד סיים את מכסת המשחקים&go_to_folder=hangup`);

                db.phoneToRoom[phone] = val1;
                saveDB();
                getRoom(val1); // יצירת החדר
            } else {
                return res.send("read=t-ברוכים הבאים לקליקינט. הקישו קוד משחק וסולמית=val_1,no,10,1,30,No,No");
            }
        }

        // 2. הילד מחובר - לוגיקת המשחק
        let roomId = db.phoneToRoom[phone];
        const room = getRoom(roomId);
        
        let player = room.activePlayers[phone];
        if (!player) {
            room.activePlayers[phone] = { name: db.phonebooks[roomId][phone] || "שחקן חדש", score: 0, lastAnswered: -1, ping: 0, loopCount: 1, hasJoined: false };
            player = room.activePlayers[phone];
            io.to(roomId).emit('updateLeaderboard', room.activePlayers);
        }

        // חיפוש האם הילד לחץ על תשובה עכשיו
        let userAns = null;
        for (let key in req.query) {
            if (key.startsWith('val_') && key !== 'val_1' && req.query[key] !== '') {
                userAns = req.query[key];
            }
        }

        // מקדמים את המונה כדי לבקש מימות המשיח משתנה חדש בכל פעם (חוסם ניתוקים לחלוטין!)
        player.loopCount++;
        let nextVar = 'val_' + player.loopCount;

        // בונים את ההודעה שהילד ישמע (בלי התנגשויות אודיו)
        let msg = "";
        
        if (!player.hasJoined) {
            player.hasJoined = true;
            msg = "מחובר בהצלחה. ";
        } else if (userAns) {
            if (room.calibrationState === 'active') {
                player.ping = Date.now() - room.calibrationStartTime;
                io.to(roomId).emit('calibrationProgress', { count: Object.values(room.activePlayers).filter(p => p.ping > 0).length });
                msg = "נקלט. ";
            } else if (room.gameActive && !room.answersLocked && room.currentQuestion >= 0) {
                let q = room.questions[room.currentQuestion];
                if (player.lastAnswered !== room.currentQuestion) {
                    player.lastAnswered = room.currentQuestion;
                    if (q.ans && userAns === String(q.ans)) {
                        let netTime = Math.max(100, (Date.now() - room.questionStartTime) - (player.ping || 0)); 
                        player.score += Math.max(10, 1000 - Math.floor(netTime / 10));
                    }
                    io.to(roomId).emit('updateLeaderboard', room.activePlayers);
                }
                msg = "תשובה נקלטה. ";
            } else {
                msg = "נקלט. ";
            }
        }

        // מוסיפים את הסטטוס הנוכחי של המשחק
        if (room.calibrationState === 'prepared') {
            msg += "היכונו למבחן";
        } else if (room.calibrationState === 'active') {
            msg += "הקש 1 עכשיו";
        } else if (room.gameActive && !room.answersLocked) {
            if (player.lastAnswered === room.currentQuestion) {
                msg += "ממתין";
            } else {
                msg += "הקש תשובה";
            }
        } else {
            msg += "ממתין";
        }
        
        // פקודת הקסם - שולחת את המשפט השלם ומחכה לתשובה למשתנה החדש (15 שניות המתנה כל פעם)
        return res.send(`read=t-${msg}=${nextVar},no,1,1,15,No,No`);

    } catch(err) {
        console.error(err);
        res.send("id_list_message=t-שגיאת מערכת&go_to_folder=hangup");
    }
});

io.on('connection', (socket) => {
    // 👑 כניסת מנהל על
    socket.on('superLogin', (pass) => {
        if (pass === "Ahal2026!") socket.emit('superData', db.pins);
        else socket.emit('superError');
    });

    // 🚀 יצירת הרבה קודים בבת אחת
    socket.on('createBulkPins', (data) => {
        for(let i = parseInt(data.start); i <= parseInt(data.end); i++) {
            db.pins[i.toString()] = { type: data.type, gamesLeft: 3, created: new Date().toLocaleDateString('he-IL') };
        }
        saveDB(); io.emit('superData', db.pins); 
    });

    socket.on('deletePin', (pin) => { delete db.pins[pin]; saveDB(); io.emit('superData', db.pins); });

    socket.on('joinRoom', (roomId) => {
        if (!db.pins[roomId]) return socket.emit('loginResponse', { success: false, error: 'קוד לא קיים!' });
        if (db.pins[roomId].gamesLeft <= 0) return socket.emit('loginResponse', { success: false, error: 'נגמרה מכסת המשחקים!' });
        socket.join(roomId); socket.roomId = roomId; const room = getRoom(roomId);
        socket.emit('loginResponse', { success: true, gamesLeft: db.pins[roomId].gamesLeft });
        socket.emit('updateSettings', room.gameSettings); socket.emit('updateLeaderboard', room.activePlayers);
        socket.emit('lockState', room.answersLocked); socket.emit('updateQuestions', room.questions);
        socket.emit('updateSavedGames', Object.keys(db.savedGames[roomId] || {}));
    });

    socket.on('startGame', () => { 
        if(!socket.roomId) return; let room = rooms[socket.roomId]; if(room.questions.length === 0) return; 
        db.pins[socket.roomId].gamesLeft--; saveDB(); io.to(socket.roomId).emit('updateGamesLeft', db.pins[socket.roomId].gamesLeft);
        room.gameActive = true; room.currentQuestion = 0; room.answersLocked = true; 
        for(let p in room.activePlayers) { room.activePlayers[p].score = 0; room.activePlayers[p].lastAnswered = -1; } 
        io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('updateLeaderboard', room.activePlayers); 
    });

    socket.on('saveSettings', s => { if(socket.roomId) { rooms[socket.roomId].gameSettings = s; io.to(socket.roomId).emit('updateSettings', s); } });
    socket.on('triggerEffect', type => { if(socket.roomId) io.to(socket.roomId).emit('playEffect', type); });
    socket.on('changeBackground', bg => { if(socket.roomId) io.to(socket.roomId).emit('setBg', bg); });
    socket.on('prepareCalibration', () => { if(socket.roomId) { rooms[socket.roomId].calibrationState = 'prepared'; for(let p in rooms[socket.roomId].activePlayers) rooms[socket.roomId].activePlayers[p].ping = 0; io.to(socket.roomId).emit('prepareCalibration'); } });
    socket.on('startCalibration', () => { if(socket.roomId) { rooms[socket.roomId].calibrationState = 'active'; rooms[socket.roomId].calibrationStartTime = Date.now(); io.to(socket.roomId).emit('startCalibration'); } });
    socket.on('endCalibration', () => { if(socket.roomId) { rooms[socket.roomId].calibrationState = 'off'; let pings = Object.values(rooms[socket.roomId].activePlayers).filter(p => p.ping > 0).map(p => p.ping); let stats = { count: pings.length, avg: 0, min: 0, max: 0 }; if(pings.length > 0) { stats.avg = Math.round(pings.reduce((a,b)=>a+b,0)/pings.length); stats.min = Math.min(...pings); stats.max = Math.max(...pings); } io.to(socket.roomId).emit('endCalibration', stats); } });
    socket.on('updatePlayerName', ({ phone, newName }) => { if(socket.roomId) { db.phonebooks[socket.roomId][phone] = newName; saveDB(); if (rooms[socket.roomId].activePlayers[phone]) rooms[socket.roomId].activePlayers[phone].name = newName; io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers); } });
    socket.on('addSingleQuestion', q => { if(socket.roomId) { rooms[socket.roomId].questions.push(q); io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('clearQuestions', () => { if(socket.roomId) { rooms[socket.roomId].questions = []; io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('saveGameToBank', name => { if(socket.roomId) { db.savedGames[socket.roomId][name] = [...rooms[socket.roomId].questions]; saveDB(); io.to(socket.roomId).emit('updateSavedGames', Object.keys(db.savedGames[socket.roomId])); } });
    socket.on('loadGameFromBank', name => { if(socket.roomId && db.savedGames[socket.roomId][name]) { rooms[socket.roomId].questions = [...db.savedGames[socket.roomId][name]]; io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    socket.on('deleteGameFromBank', name => { if(socket.roomId) { delete db.savedGames[socket.roomId][name]; saveDB(); io.to(socket.roomId).emit('updateSavedGames', Object.keys(db.savedGames[socket.roomId])); } });
    socket.on('toggleLock', lock => { if(socket.roomId) { rooms[socket.roomId].answersLocked = lock; if(lock && rooms[socket.roomId].timerTimeout) clearTimeout(rooms[socket.roomId].timerTimeout); io.to(socket.roomId).emit('lockState', rooms[socket.roomId].answersLocked); } });
    socket.on('startTimer', sec => { if(socket.roomId) { let room = rooms[socket.roomId]; room.answersLocked = false; room.questionStartTime = Date.now(); io.to(socket.roomId).emit('lockState', false); io.to(socket.roomId).emit('startCountdown', sec); if(room.timerTimeout) clearTimeout(room.timerTimeout); room.timerTimeout = setTimeout(() => { room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('playEffect', 'shake'); }, sec * 1000); } });
    socket.on('nextQuestion', () => { if(socket.roomId) { let room = rooms[socket.roomId]; room.currentQuestion++; if (room.currentQuestion < room.questions.length) { room.answersLocked = true; for(let p in room.activePlayers) room.activePlayers[p].currentChoice = null; io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); } else { room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('gameOver'); } } });
    socket.on('showVictoryScreen', () => { if(socket.roomId) { let room = rooms[socket.roomId]; room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); const topPlayers = Object.values(room.activePlayers).sort((a,b) => b.score - a.score).slice(0, 3); io.to(socket.roomId).emit('victoryPodium', topPlayers); } });
    socket.on('clearPlayers', () => { if(socket.roomId) { rooms[socket.roomId].activePlayers = {}; io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers); } });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V40.0 (The Iron Vault) is ONLINE ==="));
