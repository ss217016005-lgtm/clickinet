const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

if (!fs.existsSync('uploads')) { fs.mkdirSync('uploads'); }
app.use('/uploads', express.static('uploads'));

const DB_PATH = 'uploads/database.json';
let db = { phonebooks: {}, savedGames: {}, pins: {}, phoneToRoom: {} };
try { 
    if (fs.existsSync(DB_PATH)) {
        let data = fs.readFileSync(DB_PATH, 'utf8');
        if (data.trim() !== '') db = JSON.parse(data);
    }
} catch(e) {}

function saveDB() { try { fs.writeFileSync(DB_PATH, JSON.stringify(db)); } catch(e){} }

let rooms = {};

function getRoom(roomId) {
    if (!rooms[roomId]) {
        rooms[roomId] = {
            activePlayers: {}, questions: [], currentQuestion: -1, gameActive: false, answersLocked: true,
            isDoublePoints: false, // 🎰 מנוע הדאבל
            gameSettings: { 
                gameName: "קליקינט", phoneNumber: "077-2296674", sponsorUrl: "", // 💼 לוגו חסות
                isPremium: (db.pins[roomId]?.type === 'premium' || db.pins[roomId]?.type === 'gold'),
                isGold: (db.pins[roomId]?.type === 'gold')
            },
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

app.all('/api/answer', (req, res) => {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    try {
        const exactHitTime = Date.now(); 
        const input = { ...req.query, ...req.body };
        const phone = input.ApiPhone || "unknown";
        let ext = input.ApiExtension || "";
        let folderPath = ext.startsWith('/') ? ext : '/' + ext; 
        if (folderPath === '/') folderPath = '/'; 
        let roomId = db.phoneToRoom[phone];
        let val = input.val_1; 

        if (!roomId) {
            if (val !== undefined && val !== '') {
                if (val === '1' && !db.pins['1']) return res.send("read=t-נא להקיש קוד משחק וסולמית=val_1,no,10,1,15,no,no");
                if (!db.pins[val]) return res.send(`read=t-קוד שגוי נא לנסות שוב=val_1,no,10,1,15,no,no`);
                if (db.pins[val].expiresAt && exactHitTime > db.pins[val].expiresAt) return res.send(`id_list_message=t-תוקף הקוד פג&go_to_folder=hangup`);
                if (db.pins[val].gamesLeft <= 0) return res.send(`id_list_message=t-הקוד סיים את המכסה&go_to_folder=hangup`);
                db.phoneToRoom[phone] = val; saveDB(); getRoom(val);
                return res.send(`id_list_message=t-מחובר בהצלחה&go_to_folder=${folderPath}`);
            } else { return res.send("read=t-ברוכים הבאים הקישו קוד משחק וסולמית=val_1,no,10,1,15,no,no"); }
        }

        const room = getRoom(roomId);
        let player = room.activePlayers[phone];
        if (!player) {
            room.activePlayers[phone] = { name: db.phonebooks[roomId][phone] || "שחקן חדש", score: 0, lastAnswered: -1, ping: 0, streak: 0, lastBreakdown: "" };
            player = room.activePlayers[phone];
            io.to(roomId).emit('updateLeaderboard', room.activePlayers);
        }
        let totalPlayers = Object.keys(room.activePlayers).length;
        if (!room.gameSettings.isPremium && totalPlayers > 10) return res.send(`id_list_message=t-המשחק החינמי מוגבל לעשרה שחקנים&go_to_folder=${folderPath}`);
        if (val === '') return res.send(`go_to_folder=${folderPath}`);
        if (val && val !== '') {
            if (room.calibrationState === 'active') {
                player.ping = exactHitTime - room.calibrationStartTime;
                io.to(roomId).emit('calibrationProgress', { count: Object.values(room.activePlayers).filter(p => p.ping > 0).length });
                return res.send(`id_list_message=t-נקלט&go_to_folder=${folderPath}`);
            }
            if (room.gameActive && !room.answersLocked && room.currentQuestion >= 0) {
                let q = room.questions[room.currentQuestion];
                if (player.lastAnswered !== room.currentQuestion) {
                    player.lastAnswered = room.currentQuestion;
                    player.currentChoice = val; // שומרים את ההצבעה בשביל הגרף
                    
                    if (q.ans && val === String(q.ans)) {
                        let netTime = Math.max(100, (exactHitTime - room.questionStartTime) - (player.ping || 0)); 
                        
                        // 🎰 מערכת הדאבל!
                        let multiplier = room.isDoublePoints ? 2 : 1;
                        let baseScore = 100 * multiplier;
                        let speedBonus = Math.max(0, 100 - Math.floor(netTime / 1000)) * multiplier;
                        
                        player.streak = (player.streak || 0) + 1; 
                        let streakBonus = (player.streak > 1) ? (player.streak * 15) : 0; 
                        player.score += (baseScore + speedBonus + streakBonus); 
                        player.lastBreakdown = `✅ ענה נכון! | ${room.isDoublePoints?'דאבל!':''} +${baseScore+speedBonus+streakBonus}`;
                    } else { player.streak = 0; player.lastBreakdown = `❌ טעות (בחר ${val})`; }
                    io.to(roomId).emit('updateLeaderboard', room.activePlayers);
                }
                return res.send(`id_list_message=t-תשובה נקלטה&go_to_folder=${folderPath}`);
            }
            if (room.answersLocked) return res.send(`id_list_message=t-המענה סגור כעת&go_to_folder=${folderPath}`);
            return res.send(`id_list_message=t-נקלט&go_to_folder=${folderPath}`);
        }
        return res.send("read=t-ממתין=val_1,no,1,1,10,no,no");
    } catch(err) { res.send("id_list_message=t-שגיאה&go_to_folder=hangup"); }
});

io.on('connection', (socket) => {
    socket.on('superLogin', (pass) => { if (pass === "Ahal2026!") socket.emit('superData', db.pins); else socket.emit('superError'); });
    socket.on('createBulkPins', (data) => {
        let start = parseInt(data.start); let end = data.end ? parseInt(data.end) : start; 
        let initialGames = data.type === 'gold' ? 9999 : 3;
        for(let i = start; i <= end; i++) {
            db.pins[i.toString()] = { type: data.type, gamesLeft: initialGames, created: new Date().toLocaleDateString('he-IL'), expiresAt: data.expiresAt };
        }
        saveDB(); io.emit('superData', db.pins); 
    });
    socket.on('deletePin', (pin) => { delete db.pins[pin]; saveDB(); io.emit('superData', db.pins); });
    
    socket.on('joinRoom', (roomId) => {
        if (!db.pins[roomId]) return socket.emit('loginResponse', { success: false, error: 'קוד לא קיים!' });
        if (db.pins[roomId].expiresAt && Date.now() > db.pins[roomId].expiresAt) return socket.emit('loginResponse', { success: false, error: 'הקוד פג תוקף!' });
        socket.join(roomId); socket.roomId = roomId; const room = getRoom(roomId);
        let gamesDisplay = (db.pins[roomId].type === 'gold') ? 'ללא הגבלה 👑' : db.pins[roomId].gamesLeft;
        socket.emit('loginResponse', { success: true, gamesLeft: gamesDisplay });
        socket.emit('updateSettings', room.gameSettings); 
        socket.emit('updateLeaderboard', room.activePlayers);
        socket.emit('lockState', room.answersLocked); 
        socket.emit('updateQuestions', room.questions);
        socket.emit('doublePointsState', room.isDoublePoints);
    });

    socket.on('startGame', () => { 
        if(!socket.roomId) return; let room = rooms[socket.roomId]; if(room.questions.length === 0) return; 
        if (db.pins[socket.roomId].type !== 'gold') { db.pins[socket.roomId].gamesLeft--; saveDB(); }
        let gamesDisplay = (db.pins[socket.roomId].type === 'gold') ? 'ללא הגבלה 👑' : db.pins[socket.roomId].gamesLeft;
        io.to(socket.roomId).emit('updateGamesLeft', gamesDisplay);
        room.gameActive = true; room.currentQuestion = 0; room.answersLocked = true; room.isDoublePoints = false;
        for(let p in room.activePlayers) { room.activePlayers[p].score = 0; room.activePlayers[p].lastAnswered = -1; room.activePlayers[p].streak = 0; room.activePlayers[p].currentChoice = null; } 
        io.to(socket.roomId).emit('doublePointsState', false);
        io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('updateLeaderboard', room.activePlayers); 
    });

    socket.on('addSingleQuestion', q => { 
        if(socket.roomId) { 
            if (q.imgBase64) {
                const base64Data = q.imgBase64.replace(/^data:image\/\w+;base64,/, "");
                const fileName = 'img_' + Date.now() + '.png';
                fs.writeFileSync('uploads/' + fileName, base64Data, 'base64');
                q.image = '/uploads/' + fileName; delete q.imgBase64;
            }
            rooms[socket.roomId].questions.push(q); io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); 
        } 
    });

    // 🗑️ מחיקת שאלה בודדת
    socket.on('deleteSingleQuestion', index => {
        if(socket.roomId && rooms[socket.roomId].questions[index]) {
            rooms[socket.roomId].questions.splice(index, 1);
            io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions);
        }
    });

    // 🥾 העפת שחקן
    socket.on('kickPlayer', phone => {
        if(socket.roomId && rooms[socket.roomId].activePlayers[phone]) {
            delete rooms[socket.roomId].activePlayers[phone];
            delete db.phoneToRoom[phone]; saveDB();
            io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers);
        }
    });

    // 💼 העלאת לוגו ספונסר
    socket.on('uploadSponsor', data => {
        if(socket.roomId && rooms[socket.roomId].gameSettings.isGold && data.imgBase64) {
            const base64Data = data.imgBase64.replace(/^data:image\/\w+;base64,/, "");
            const fileName = 'sponsor_' + socket.roomId + '_' + Date.now() + '.png';
            fs.writeFileSync('uploads/' + fileName, base64Data, 'base64');
            rooms[socket.roomId].gameSettings.sponsorUrl = '/uploads/' + fileName;
            io.to(socket.roomId).emit('updateSettings', rooms[socket.roomId].gameSettings);
        }
    });

    // 🎰 שאלת דאבל
    socket.on('toggleDoublePoints', isDouble => {
        if(socket.roomId) {
            rooms[socket.roomId].isDoublePoints = isDouble;
            io.to(socket.roomId).emit('doublePointsState', isDouble);
        }
    });

    // 📈 חישוב גרף ההצבעות
    socket.on('showChart', () => {
        if(socket.roomId) {
            let room = rooms[socket.roomId];
            let counts = {1:0, 2:0, 3:0, 4:0};
            for(let p in room.activePlayers) {
                let c = room.activePlayers[p].currentChoice;
                if(c && counts[c] !== undefined) counts[c]++;
            }
            io.to(socket.roomId).emit('displayChart', counts);
        }
    });

    socket.on('revealAnswer', () => { if(socket.roomId && rooms[socket.roomId].currentQuestion >= 0) io.to(socket.roomId).emit('showCorrectAnswer', rooms[socket.roomId].questions[rooms[socket.roomId].currentQuestion].ans); });
    socket.on('triggerEffect', type => { if(socket.roomId) io.to(socket.roomId).emit('playEffect', type); });
    socket.on('toggleMusic', state => { if(socket.roomId) io.to(socket.roomId).emit('musicState', state); });
    socket.on('clearQuestions', () => { if(socket.roomId) { rooms[socket.roomId].questions = []; io.to(socket.roomId).emit('updateQuestions', rooms[socket.roomId].questions); } });
    
    socket.on('toggleLock', lock => { if(socket.roomId) { rooms[socket.roomId].answersLocked = lock; if(lock && rooms[socket.roomId].timerTimeout) clearTimeout(rooms[socket.roomId].timerTimeout); io.to(socket.roomId).emit('lockState', rooms[socket.roomId].answersLocked); } });
    socket.on('startTimer', sec => { if(socket.roomId) { let room = rooms[socket.roomId]; room.answersLocked = false; room.questionStartTime = Date.now(); io.to(socket.roomId).emit('lockState', false); io.to(socket.roomId).emit('startCountdown', sec); if(room.timerTimeout) clearTimeout(room.timerTimeout); room.timerTimeout = setTimeout(() => { room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); io.to(socket.roomId).emit('playEffect', 'shake'); }, sec * 1000); } });
    
    socket.on('nextQuestion', () => { if(socket.roomId) { let room = rooms[socket.roomId]; room.currentQuestion++; if (room.currentQuestion < room.questions.length) { room.answersLocked = true; room.isDoublePoints = false; io.to(socket.roomId).emit('doublePointsState', false); for(let p in room.activePlayers) room.activePlayers[p].currentChoice = null; io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); } else { room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('gameOver'); } } });
    socket.on('prevQuestion', () => { if(socket.roomId) { let room = rooms[socket.roomId]; if (room.currentQuestion > 0) { room.currentQuestion--; room.answersLocked = true; room.isDoublePoints = false; io.to(socket.roomId).emit('doublePointsState', false); for(let p in room.activePlayers) room.activePlayers[p].currentChoice = null; io.to(socket.roomId).emit('newQuestion', room.questions[room.currentQuestion]); io.to(socket.roomId).emit('lockState', true); } } });
    
    socket.on('showVictoryScreen', () => { if(socket.roomId) { let room = rooms[socket.roomId]; room.gameActive = false; room.answersLocked = true; io.to(socket.roomId).emit('lockState', true); const topPlayers = Object.values(room.activePlayers).sort((a,b) => b.score - a.score).slice(0, 3); io.to(socket.roomId).emit('victoryPodium', topPlayers); } });
    socket.on('updatePlayerName', ({ phone, newName }) => { if(socket.roomId) { db.phonebooks[socket.roomId][phone] = newName; saveDB(); if (rooms[socket.roomId].activePlayers[phone]) rooms[socket.roomId].activePlayers[phone].name = newName; io.to(socket.roomId).emit('updateLeaderboard', rooms[socket.roomId].activePlayers); } });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V57.0 (Enterprise 8-Features) is ONLINE ==="));
