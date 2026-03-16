const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

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

// 🛡️ שאיבת הכל - app.all קולט גם GET וגם POST!
app.all('/api/answer', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    try {
        // מאחדים את הנתונים, לא משנה איך ימות המשיח שלחו אותם
        const input = { ...req.query, ...req.body };
        console.log("📞 בקשה נכנסת מימות המשיח: ", JSON.stringify(input));

        const phone = input.ApiPhone || "unknown";
        let ext = input.ApiExtension || "1";
        let folderPath = ext.startsWith('/') ? ext : '/' + ext; 
        if (folderPath === '/') folderPath = '/1';

        let roomId = db.phoneToRoom[phone];
        let val2 = input.val_2; // קוד משחק
        let val3 = input.val_3; // תשובות במשחק

        // --- 1. הילד עוד לא מחובר ---
        if (!roomId) {
            if (val2 !== undefined && val2 !== '') {
                if (!db.pins[val2]) {
                    console.log("❌ קוד שגוי:", val2);
                    return res.send(`id_list_message=t-קוד המשחק אינו קיים&go_to_folder=hangup`);
                }
                if (db.pins[val2].gamesLeft <= 0) {
                    console.log("❌ נגמרה מכסה לקוד:", val2);
                    return res.send(`id_list_message=t-הקוד סיים את המכסה&go_to_folder=hangup`);
                }

                console.log("✅ מחובר לחדר:", val2);
                db.phoneToRoom[phone] = val2;
                saveDB();
                getRoom(val2);
                
                return res.send(`id_list_message=t-מחובר בהצלחה&go_to_folder=${folderPath}`);
            } else {
                console.log("⏳ מבקש קוד משחק מהמשתמש...");
                return res.send("read=t-ברוכים הבאים. הקישו קוד משחק וסיום בסולמית=val_2,no,10,1,15,No,No");
            }
        }

        // --- 2. הילד מחובר ---
        const room = getRoom(roomId);
        let player = room.activePlayers[phone];
        if (!player) {
            room.activePlayers[phone] = { name: db.phonebooks[roomId][phone] || "שחקן", score: 0, lastAnswered: -1, ping: 0 };
            player = room.activePlayers[phone];
            io.to(roomId).emit('updateLeaderboard', room.activePlayers);
        }

        // "מכונת הכביסה"
        if (val3 === '') {
            console.log("🔄 ריסטרט שקט");
            return res.send(`go_to_folder=${folderPath}`);
        }
        
        // הילד לחץ על תשובה!
        if (val3 && val3 !== '') {
            console.log("🎯 שחקן לחץ:", val3);
            if (room.calibrationState === 'active') {
                player.ping = Date.now() - room.calibrationStartTime;
                io.to(roomId).emit('calibrationProgress', { count: Object.values(room.activePlayers).filter(p => p.ping > 0).length });
                return res.send(`id_list_message=t-נקלט&go_to_folder=${folderPath}`);
            }
            if (room.gameActive && !room.answersLocked && room.currentQuestion >= 0) {
                let q = room.questions[room.currentQuestion];
                if (player.lastAnswered !== room.currentQuestion) {
                    player.lastAnswered = room.currentQuestion;
                    if (q.ans && val3 === String(q.ans)) {
                        let netTime = Math.max(100, (Date.now() - room.questionStartTime) - (player.ping || 0)); 
                        player.score += Math.max(10, 1000 - Math.floor(netTime / 10));
                    }
                    io.to(roomId).emit('updateLeaderboard', room.activePlayers);
                }
                return res.send(`id_list_message=t-תשובה נקלטה&go_to_folder=${folderPath}`);
            }
            return res.send(`id_list_message=t-נקלט&go_to_folder=${folderPath}`);
        }

        // --- 3. הילד נכנס נקי לשלוחה ---
        if (room.calibrationState === 'prepared') return res.send("read=t-היכונו=val_3,no,1,1,10,No,No");
        if (room.calibrationState === 'active') return res.send("read=t-הקש 1 עכשיו=val_3,no,1,1,10,No,No");
        if (room.gameActive && !room.answersLocked) {
            if (player.lastAnswered === room.currentQuestion) return res.send("read=t-ממתין=val_3,no,1,1,10,No,No");
            return res.send("read=t-הקש תשובה=val_3,no,1,1,15,No,No");
        }
        
        console.log("⏳ משמיע ממתין...");
        return res.send("read=t-ממתין=val_3,no,1,1,10,No,No");

    } catch(err) {
        console.error("❌ שגיאה בקוד:", err);
        res.send("id_list_message=t-שגיאה&go_to_folder=hangup");
    }
});

io.on('connection', (socket) => {
    socket.on('superLogin', (pass) => {
        if (pass === "Ahal2026!") socket.emit('superData', db.pins);
        else socket.emit('superError');
    });
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
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V45.0 (Omni-Catcher GET/POST Engine) is ONLINE ==="));
