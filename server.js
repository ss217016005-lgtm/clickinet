const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let phonebook = {};
try { if (fs.existsSync('phonebook.json')) phonebook = JSON.parse(fs.readFileSync('phonebook.json', 'utf8')); } catch(e) {}

let activePlayers = {}; 
let questions = []; 
let currentQuestion = -1;
let gameActive = false;
let answersLocked = true; 
let gameSettings = { gameName: "קליקינט", phoneNumber: "077-2296674", isPremium: false };

let calibrationState = 'off';
let calibrationStartTime = 0;
let questionStartTime = 0;
let timerTimeout = null; 

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

app.post('/api/webhook/meshulam', (req, res) => {
    if (req.body.status === '1' || req.body.status === 1) { gameSettings.isPremium = true; io.emit('updateSettings', gameSettings); }
    res.status(200).send("OK");
});

// 📞 מנוע התקשורת החכם והנצחי! (Bypass Yemot HaMashiach Caching)
app.get('/api/answer', (req, res) => {
    const phone = req.query.ApiPhone || "unknown";
    
    // חיפוש חכם של התשובה (מזהה כל משתנה שמתחיל ב-val_)
    let userChoice = null;
    for (let key in req.query) {
        if (key.startsWith('val_') && req.query[key] !== '') {
            userChoice = req.query[key];
            break;
        }
    }

    // יצירת מזהה משתנה רנדומלי כדי שימות המשיח בחיים לא ידלגו עליו
    const nextVar = "val_" + Math.floor(Math.random() * 100000);

    if (!activePlayers[phone]) {
        if (!gameSettings.isPremium && Object.keys(activePlayers).length >= 10) {
            return res.send("id_list_message=t-המשחק מוגבל לעשרה שחקנים. פנה למנהל&go_to_folder=hangup"); 
        }
        activePlayers[phone] = { name: phonebook[phone] || "שחקן חדש", score: 0, lastAnswered: -1, currentChoice: null, ping: 0 };
        io.emit('updateLeaderboard', activePlayers);
    }

    if (userChoice) {
        if (calibrationState === 'active') {
            let userPing = Date.now() - calibrationStartTime;
            activePlayers[phone].ping = userPing; 
            io.emit('calibrationProgress', { count: Object.values(activePlayers).filter(p => p.ping > 0).length });
            return res.send(`read=t-בדיקת המהירות נקלטה בהצלחה. אנא המתינו=${nextVar},no,1,1,60,No,No`);
        } else if (calibrationState === 'prepared') {
            return res.send(`read=t-הקשתם מוקדם מדי. המתינו להוראת ההזנקה=${nextVar},no,1,1,60,No,No`);
        }

        if (answersLocked) return res.send(`read=t-המענה סגור כעת, נא להמתין=${nextVar},no,1,1,60,No,No`);
        
        if (gameActive && currentQuestion >= 0 && currentQuestion < questions.length) {
            let q = questions[currentQuestion];
            if (activePlayers[phone].lastAnswered !== currentQuestion) {
                activePlayers[phone].lastAnswered = currentQuestion;
                activePlayers[phone].currentChoice = userChoice;
                if (q.ans && userChoice === String(q.ans)) {
                    let netTime = Math.max(100, (Date.now() - questionStartTime) - (activePlayers[phone].ping || 0)); 
                    activePlayers[phone].score += Math.max(10, 1000 - Math.floor(netTime / 10));
                }
                io.emit('updateLeaderboard', activePlayers);
            }
        }
        return res.send(`read=t-תשובתך נקלטה. אנא המתינו לשאלה הבאה=${nextVar},no,1,1,60,No,No`);
    }
    
    if (answersLocked && calibrationState === 'off') {
        res.send(`read=t-המענה סגור כעת. הישארו על הקו=${nextVar},no,1,1,60,No,No`);
    } else {
        res.send(`read=t-הקש את תשובתך=${nextVar},no,1,1,60,No,No`);
    }
});

io.on('connection', (socket) => {
    socket.emit('updateSettings', gameSettings);
    socket.emit('updateLeaderboard', activePlayers);
    socket.emit('lockState', answersLocked);

    socket.on('saveSettings', s => { gameSettings = s; io.emit('updateSettings', s); });
    socket.on('triggerEffect', type => { io.emit('playEffect', type); });
    socket.on('changeBackground', bg => { io.emit('setBg', bg); });

    socket.on('prepareCalibration', () => { calibrationState = 'prepared'; for(let p in activePlayers) activePlayers[p].ping = 0; io.emit('prepareCalibration'); });
    socket.on('startCalibration', () => { calibrationState = 'active'; calibrationStartTime = Date.now(); io.emit('startCalibration'); });
    socket.on('endCalibration', () => { 
        calibrationState = 'off'; 
        let pings = Object.values(activePlayers).filter(p => p.ping > 0).map(p => p.ping);
        let stats = { count: pings.length, avg: 0, min: 0, max: 0 };
        if(pings.length > 0) { stats.avg = Math.round(pings.reduce((a,b)=>a+b,0)/pings.length); stats.min = Math.min(...pings); stats.max = Math.max(...pings); }
        io.emit('endCalibration', stats); 
    });

    socket.on('updatePlayerName', ({ phone, newName }) => {
        phonebook[phone] = newName;
        try { fs.writeFileSync('phonebook.json', JSON.stringify(phonebook)); } catch(e){} 
        if (activePlayers[phone]) activePlayers[phone].name = newName;
        io.emit('updateLeaderboard', activePlayers);
    });

    socket.on('addSingleQuestion', q => { questions.push(q); io.emit('updateQuestions', questions); });
    socket.on('toggleLock', lock => { answersLocked = lock; if(lock && timerTimeout) clearTimeout(timerTimeout); io.emit('lockState', answersLocked); });

    socket.on('startTimer', sec => {
        answersLocked = false; questionStartTime = Date.now(); 
        io.emit('lockState', false); io.emit('startCountdown', sec);
        if(timerTimeout) clearTimeout(timerTimeout);
        timerTimeout = setTimeout(() => { answersLocked = true; io.emit('lockState', true); io.emit('playEffect', 'shake'); }, sec * 1000);
    });

    socket.on('startGame', () => {
        if(questions.length === 0) return;
        gameActive = true; currentQuestion = 0; answersLocked = true; 
        for(let p in activePlayers) { activePlayers[p].score = 0; activePlayers[p].currentChoice = null; activePlayers[p].lastAnswered = -1; }
        io.emit('newQuestion', questions[currentQuestion]); io.emit('lockState', true); io.emit('updateLeaderboard', activePlayers);
    });

    socket.on('nextQuestion', () => {
        currentQuestion++;
        if (currentQuestion < questions.length) {
            answersLocked = true; for(let p in activePlayers) activePlayers[p].currentChoice = null;
            io.emit('newQuestion', questions[currentQuestion]); io.emit('lockState', true);
        } else {
            gameActive = false; answersLocked = true; io.emit('gameOver');
        }
    });

    socket.on('showVictoryScreen', () => {
        gameActive = false;
        answersLocked = true;
        io.emit('lockState', true);
        const topPlayers = Object.values(activePlayers).sort((a,b) => b.score - a.score).slice(0, 3);
        io.emit('victoryPodium', topPlayers);
    });

    socket.on('clearPlayers', () => { activePlayers = {}; io.emit('updateLeaderboard', activePlayers); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V18.0 (Anti-Hangup Bypass) is ONLINE ==="));
