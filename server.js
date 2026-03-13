const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

let phonebook = {};
if (fs.existsSync('phonebook.json')) {
    phonebook = JSON.parse(fs.readFileSync('phonebook.json'));
}

let activePlayers = {}; 
let questions = []; 
let currentQuestion = -1;
let gameActive = false;
let answersLocked = true; 
let gameSettings = { gameName: "קליקינט", phoneNumber: "077-2296674" };

let savedGames = {};
if (fs.existsSync('games.json')) {
    savedGames = JSON.parse(fs.readFileSync('games.json'));
}

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

app.get('/api/answer', (req, res) => {
    const phone = req.query.ApiPhone || "unknown";
    const userChoice = req.query.val_1; 

    if (!activePlayers[phone]) {
        activePlayers[phone] = { name: phonebook[phone] || "שחקן חדש", score: 0, lastAnswered: -1, currentChoice: null };
        io.emit('updatePlayers', activePlayers);
        io.emit('updateLeaderboard', activePlayers);
    }

    // שלב 1: אם הלקוח כבר הקיש תשובה
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
        // השרת אומר תודה ומנתק!
        return res.send("id_list_message=t-תשובתך נקלטה בהצלחה&go_to_folder=hangup");
    }
    
    // שלב 2: הלקוח הרגע חייג ועוד לא הקיש כלום
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
        fs.writeFileSync('phonebook.json', JSON.stringify(phonebook)); 
        if (activePlayers[phone]) activePlayers[phone].name = newName;
        io.emit('updatePlayers', activePlayers);
        io.emit('updateLeaderboard', activePlayers);
    });
    socket.on('clearPlayers', () => { activePlayers = {}; io.emit('updatePlayers', activePlayers); io.emit('updateLeaderboard', activePlayers); });

    socket.on('addQuestions', qs => { questions = questions.concat(qs); io.emit('updateQuestions', questions); });
    socket.on('addSingleQuestion', q => { questions.push(q); io.emit('updateQuestions', questions); });
    socket.on('clearQuestions', () => { questions = []; io.emit('updateQuestions', questions); });
    socket.on('saveGameToBank', n => { savedGames[n] = [...questions]; fs.writeFileSync('games.json', JSON.stringify(savedGames)); io.emit('updateSavedGames', Object.keys(savedGames)); });
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
http.listen(PORT, () => console.log("=== Clickinet V12.1 is ONLINE ==="));
