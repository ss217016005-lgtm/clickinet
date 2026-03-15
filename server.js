const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs'); 

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

let phonebook = {};
try {
    if (fs.existsSync('phonebook.json')) {
        let data = fs.readFileSync('phonebook.json', 'utf8');
        if (data.trim() !== '') phonebook = JSON.parse(data);
    }
} catch(e) {}

let activePlayers = {}; 
let questions = []; 
let currentQuestion = -1;
let gameActive = false;
let answersLocked = true; 
let gameSettings = { gameName: "קליקינט", phoneNumber: "077-2296674", isPremium: false };

// ⏱️ משתני הרדאר והזמנים!
let calibrationActive = false;
let calibrationStartTime = 0;
let questionStartTime = 0;

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

app.post('/api/webhook/meshulam', (req, res) => {
    if (req.body.status === '1' || req.body.status === 1) {
        gameSettings.isPremium = true;
        io.emit('updateSettings', gameSettings);
    }
    res.status(200).send("OK");
});

app.get('/api/answer', (req, res) => {
    const phone = req.query.ApiPhone || "unknown";
    const userChoice = req.query.val_1; 

    if (!activePlayers[phone]) {
        if (!gameSettings.isPremium && Object.keys(activePlayers).length >= 10) {
            return res.send("id_list_message=t-המשחק החינמי מוגבל לעשרה שחקנים. מנהל המשחק נדרש לשדרג לפרימיום&go_to_folder=hangup");
        }
        // הוספנו משתנה ping (זמן רשת) לכל שחקן
        activePlayers[phone] = { name: phonebook[phone] || "שחקן חדש", score: 0, lastAnswered: -1, currentChoice: null, ping: 0 };
        io.emit('updateLeaderboard', activePlayers);
    }

    if (userChoice) {
        // 📡 אם אנחנו בזמן מבחן מהירות (קליברציה)
        if (calibrationActive) {
            let userPing = Date.now() - calibrationStartTime;
            activePlayers[phone].ping = userPing; // שומרים את זמן הרשת המדויק שלו!
            
            // סופרים כמה אנשים עשו את המבחן ומעדכנים את המסך
            let calibratedCount = Object.values(activePlayers).filter(p => p.ping > 0).length;
            io.emit('calibrationProgress', { count: calibratedCount });
            
            return res.send("id_list_message=t-בדיקת המהירות נקלטה בהצלחה&go_to_folder=hangup");
        }

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
                        // 🧠 אלגוריתם הקיזוז המטורף!
                        let rawTime = Date.now() - questionStartTime;
                        let netTime = rawTime - (activePlayers[phone].ping || 0); // מקזזים את זמן הרשת הספציפי שלו!
                        if (netTime < 100) netTime = 100; // הגנה
                        
                        // חישוב מ-1000 נקודות מטה לפי המהירות הנקייה (הורדה של נקודה על כל עשירית שנייה)
                        let pointsEarned = Math.max(10, 1000 - Math.floor(netTime / 10));
                        activePlayers[phone].score += pointsEarned;
                    }
                }
                io.emit('updateLeaderboard', activePlayers);
            }
        }
        return res.send("id_list_message=t-תשובתך נקלטה בהצלחה&go_to_folder=hangup");
    }
    
    if (answersLocked && !calibrationActive) {
        res.send("id_list_message=t-המענה סגור כעת, נא להביט במסך&go_to_folder=hangup");
    } else {
        res.send("read=t-הקש את תשובתך=val_1,no,1,1,10,No,No");
    }
});

io.on('connection', (socket) => {
    socket.emit('updateSettings', gameSettings);
    socket.emit('updateLeaderboard', activePlayers);
    socket.emit('lockState', answersLocked);

    socket.on('saveSettings', s => { gameSettings = s; io.emit('updateSettings', s); });
    
    // 🎭 פקודות האפקטים החדשות שהוספנו לניהול!
    socket.on('triggerEffect', type => { io.emit('playEffect', type); });
    socket.on('changeBackground', bg => { io.emit('setBg', bg); });

    // 📡 פקודות הרדאר!
    socket.on('startCalibration', () => {
        calibrationActive = true;
        calibrationStartTime = Date.now();
        io.emit('startCalibration'); // מדליק את המסך
    });
    
    socket.on('endCalibration', () => {
        calibrationActive = false;
        io.emit('endCalibration'); // מכבה את המסך
    });

    socket.on('addSingleQuestion', q => { questions.push(q); io.emit('updateQuestions', questions); });
    socket.on('toggleLock', lock => { answersLocked = lock; io.emit('lockState', answersLocked); });

    socket.on('startGame', () => {
        if(questions.length === 0) return;
        gameActive = true; currentQuestion = 0; answersLocked = false;
        questionStartTime = Date.now(); // ⏱️ מתחילים למדוד זמן לשאלה הראשונה!
        for(let p in activePlayers) { activePlayers[p].score = 0; activePlayers[p].currentChoice = null; activePlayers[p].lastAnswered = -1; }
        io.emit('newQuestion', questions[currentQuestion]);
        io.emit('lockState', false);
        io.emit('updateLeaderboard', activePlayers);
    });

    socket.on('nextQuestion', () => {
        currentQuestion++;
        if (currentQuestion < questions.length) {
            answersLocked = false; 
            questionStartTime = Date.now(); // ⏱️ מתחילים למדוד זמן לשאלה הבאה!
            for(let p in activePlayers) activePlayers[p].currentChoice = null;
            io.emit('newQuestion', questions[currentQuestion]);
            io.emit('lockState', false);
        } else {
            gameActive = false;
            answersLocked = true;
            io.emit('gameOver');
        }
    });
    
    socket.on('clearPlayers', () => { activePlayers = {}; io.emit('updateLeaderboard', activePlayers); });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => console.log("=== Clickinet V14.0 (Radar & Effects) is ONLINE ==="));
