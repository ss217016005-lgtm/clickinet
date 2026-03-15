const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

// הגדרות חשובות כדי שהשרת ידע לקרוא את הקבלות ממשולם
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let phonebook = {};
try {
    if (fs.existsSync('phonebook.json')) {
        let data = fs.readFileSync('phonebook.json', 'utf8');
        if (data.trim() !== '') phonebook = JSON.parse(data);
    }
} catch(e) { console.log("Phonebook error bypassed"); }

let activePlayers = {}; 
let questions = []; 
let currentQuestion = -1;
let gameActive = false;
let answersLocked = true; 
let gameSettings = { gameName: "קליקינט", phoneNumber: "077-2296674", isPremium: false };

let savedGames = {};
try {
    if (fs.existsSync('games.json')) {
        let data = fs.readFileSync('games.json', 'utf8');
        if (data.trim() !== '') savedGames = JSON.parse(data);
    }
} catch(e) { console.log("Games error bypassed"); }

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

// ==========================================
// 💰 מערכת התשלומים - חיבור אוטומטי למשולם
// ==========================================
app.post('/api/webhook/meshulam', (req, res) => {
    console.log("💰 התקבל איתות ממשולם:", req.body);

    // משולם שולחים 'status=1' כשהתשלום באשראי עבר בהצלחה
    if (req.body.status === '1' || req.body.status === 1) {
        gameSettings.isPremium = true;
        io.emit('updateSettings', gameSettings);
        console.log("✅ תשלום אושר! מערכת הפרימיום נפתחה אוטומטית!");
    }

    // חייבים לענות למשולם "הכל טוב" כדי שלא ישלחו את הבקשה שוב ושוב
    res.status(200).send("OK");
});
// ==========================================

app.get('/api/answer', (req, res) => {
    const phone = req.query.ApiPhone || "unknown";
    const userChoice = req.query.val_1; 

    if (!activePlayers[phone]) {
        if (!gameSettings.isPremium && Object.keys(activePlayers).length >= 10) {
            return res.send("id_list_message=t-המשחק החינמי מוגבל לעשרה שחקנים. מנהל המשחק נדרש לשדרג לפרימיום&go_to_folder=hangup");
        }

        activePlayers[phone] = { name: phonebook[phone] || "שחקן חדש", score: 0, lastAnswered: -1, currentChoice: null };
        io.emit('updatePlayers', activePlayers);
        io.emit('updateLeaderboard', activePlayers);
    }

    if (userChoice) {
        if (answersLocked) {
            return res.send("id_list_message=t-המענה סגור כעת&go_to_folder=hangup");
        }
        
        if (gameActive && currentQuestion >= 0 && currentQuestion < questions.length) {
            let q = questions[currentQuestion];
            if (activePlayers[phone].lastAnswered !== currentQuestion) {
                activePlayers[phone].lastAnswered = currentQuestion;
                activePlayers[phone].currentChoice = userChoice;
                
                if (q.ans && q.ans !== "") {
                    if (userChoice === String(q.ans)) {
                        activePlayers[phone].score += 100;
                    }
                }
                io.emit('updateLeaderboard', activePlayers);
                io.emit('updatePlayers', activePlayers);
            }
        }
        return res.send("id_list_message=t-תשובתך נקלטה בהצלחה&go_to_folder=hangup");
    }
    
    if (answersLocked) {
        res.send("id_list_message=t-המענה סגור כעת, נא להביט במסך&go_to_folder=hangup");
    } else {
        res.send("read=t-הקש את תשובתך=val_1,no,1,1,10,No,No");
    }
});

io.on('connection', (socket) => {
    socket.emit('updateSettings', gameSettings);
    socket.emit('updatePlayers', activePlayers);
    socket.emit('updateQuestions', questions);
    socket.emit('updateSavedGames', Object.keys(savedGames));
    socket.emit('updateLeaderboard', activePlayers);
    socket.emit('lockState', answersLocked);

    socket.on('saveSettings', s => { gameSettings = s; io.emit('updateSettings', s); });
    socket.on('updatePlayerName', ({ phone, newName }) => {
        phonebook[phone] = newName;
        try { fs.writeFileSync('phonebook.json', JSON.stringify(phonebook)); } catch(e){} 
        if (activePlayers[phone]) activePlayers[phone].name = newName;
        io.emit('updatePlayers', activePlayers);
        io.emit('updateLeaderboard', activePlayers);
    });
    socket.on('clearPlayers', () => { activePlayers = {}; io.emit('updatePlayers', activePlayers); io.emit('updateLeaderboard', activePlayers); });

    socket.on('addQuestions', qs => { questions = questions.concat(qs); io.emit('updateQuestions', questions); });
    socket.on('addSingleQuestion', q => { questions.push(q); io.emit('updateQuestions', questions); });
    socket.on('clearQuestions', () => { questions = []; io.emit('updateQuestions', questions); });
    socket.on('saveGameToBank', n => { savedGames[n] = [...questions]; try { fs.writeFileSync('games.json', JSON.stringify(savedGames)); } catch(e){} io.emit('updateSavedGames', Object.keys(savedGames)); });
    socket.on('loadGameFromBank', n => { questions = [...savedGames[n]]; io.emit('updateQuestions', questions); });

    socket.on('toggleLock', lock => { answersLocked = lock; io.emit('lockState', answersLocked); });
    socket.on('startTimer', sec => {
        answersLocked = false;
        io.emit('lockState', false);
        io.emit('startCountdown', sec);
    });
    socket.on('timeUp', () => { answersLocked = true; io.emit('lockState', true); });
    
    socket.on('revealPoll', () => {
        let res = {"1":0,"2":0,"3":0,"4":0}, tot = 0;
        for(let p in activePlayers) { if(activePlayers[p].currentChoice) { res[activePlayers[p].currentChoice]++; tot++; } }
        io.emit('showPollResults', { results: res, total: tot });
    });

    socket.on('startGame', () => {
        if(questions.length === 0) return;
        gameActive = true; currentQuestion = 0; answersLocked = false;
        for(let p in activePlayers) { activePlayers[p].score = 0; activePlayers[p].currentChoice = null; activePlayers[p].lastAnswered = -1; }
        io.emit('newQuestion', questions[currentQuestion]);
        io.emit('lockState', false);
        io.emit('updateLeaderboard', activePlayers);
        io.emit('updatePlayers', activePlayers);
    });

    socket.on('nextQuestion', () => {
        currentQuestion++;
        if (currentQuestion < questions.length) {
            answersLocked = false; 
            for(let p in activePlayers) activePlayers[p].currentChoice = null;
            io.emit('newQuestion', questions[currentQuestion]);
            io.emit('lockState', false);
            io.emit('updatePlayers', activePlayers);
        } else {
            gameActive = false;
            answersLocked = true;
            io.emit('gameOver');
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V13.1 (Meshulam Ready) is ONLINE ==="));
