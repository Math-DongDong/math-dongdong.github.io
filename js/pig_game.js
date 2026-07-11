document.addEventListener("DOMContentLoaded", () => {
    // --- State ---
    const state = {
        numPlayers: 2,
        winningScore: 100,
        playerNames: [],
        playerScores: [],
        currentPlayer: 0,
        pendingScore: 0,
        lastRoll: "🐷",
        gameOver: false,
        winner: null,
        rollHistory: [],
        turnOverMessage: "",
        turnTransitioning: false
    };

    let chartInstance = null;

    // --- DOM Elements ---
    const elNumPlayers = document.getElementById("numPlayers");
    const elNumPlayersVal = document.getElementById("numPlayersVal");
    const elWinningScore = document.getElementById("winningScore");
    const btnStartGame = document.getElementById("btnStartGame");
    
    const preGameMsg = document.getElementById("preGameMsg");
    const gameArea = document.getElementById("gameArea");
    const gameOverMsg = document.getElementById("gameOverMsg");
    const turnOverMsg = document.getElementById("turnOverMsg");
    
    const setupAccordionCollapse = document.getElementById("setupCollapse");

    const diceDisplay = document.getElementById("diceDisplay");
    const pendingScoreDisplay = document.getElementById("pendingScoreDisplay");
    const btnRoll = document.getElementById("btnRoll");
    const btnHold = document.getElementById("btnHold");

    const scoreboardTitle = document.getElementById("scoreboardTitle");
    const scoreboardContainer = document.getElementById("scoreboardContainer");

    const chartEmptyMsg = document.getElementById("chartEmptyMsg");
    const chartCanvasWrapper = document.getElementById("chartCanvasWrapper");
    const diceChartCanvas = document.getElementById("diceChart");

    const statsEmptyMsg = document.getElementById("statsEmptyMsg");
    const statsData = document.getElementById("statsData");

    // --- Event Listeners ---
    elNumPlayers.addEventListener("input", (e) => {
        elNumPlayersVal.innerText = e.target.value;
    });

    btnStartGame.addEventListener("click", () => {
        startGame();
        // Collapse setup accordion
        const bsCollapse = new bootstrap.Collapse(setupAccordionCollapse, { toggle: false });
        bsCollapse.hide();
    });

    btnRoll.addEventListener("click", rollDice);
    btnHold.addEventListener("click", hold);

    // --- Game Logic ---
    function startGame() {
        state.numPlayers = parseInt(elNumPlayers.value);
        state.winningScore = parseInt(elWinningScore.value);
        state.playerNames = Array.from({ length: state.numPlayers }, (_, i) => `${i + 1}모둠`);
        state.playerScores = Array(state.numPlayers).fill(0);
        state.currentPlayer = 0;
        state.pendingScore = 0;
        state.lastRoll = "🐷";
        state.gameOver = false;
        state.winner = null;
        state.turnOverMessage = "";
        state.turnTransitioning = false;
        
        // rollHistory is retained across games if not empty (as per python code: if 'roll_history' not in st.session_state)
        // Actually, Python code preserves it. Let's just keep it as is.
        
        preGameMsg.classList.add("d-none");
        gameOverMsg.classList.add("d-none");
        gameArea.classList.remove("d-none");

        btnRoll.disabled = false;
        btnHold.disabled = false;

        updateUI();
    }

    function nextTurn() {
        state.currentPlayer = (state.currentPlayer + 1) % state.numPlayers;
        state.pendingScore = 0;
        state.lastRoll = "🐷";
        updateUI();
    }

    function rollDice() {
        if (state.gameOver) return;

        const roll = Math.floor(Math.random() * 6) + 1;
        state.lastRoll = roll;
        state.rollHistory.push(roll);

        if (roll === 1) {
            state.pendingScore = 0;
            state.turnTransitioning = true;
            state.turnOverMessage = "앗! 1이 나왔습니다. 점수를 모두 잃고 턴이 넘어갑니다.";
            updateUI();

            setTimeout(() => {
                state.turnTransitioning = false;
                nextTurn();
            }, 1500);
        } else {
            state.pendingScore += roll;
            state.turnOverMessage = "";
            updateUI();
        }
    }

    function hold() {
        if (state.gameOver) return;

        state.playerScores[state.currentPlayer] += state.pendingScore;
        state.turnOverMessage = `${state.pendingScore}점을 획득했습니다!`;

        if (state.playerScores[state.currentPlayer] >= state.winningScore) {
            state.gameOver = true;
            state.winner = state.playerNames[state.currentPlayer];
            updateUI();
            
            // Confetti effect
            if(window.confetti){
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 }
                });
            }
        } else {
            state.turnTransitioning = true;
            updateUI();

            setTimeout(() => {
                state.turnTransitioning = false;
                nextTurn();
            }, 1000);
        }
    }

    function setActionButtonsEnabled(enabled) {
        btnRoll.disabled = !enabled;
        btnHold.disabled = !enabled;
    }

    // --- UI Update ---
    function updateUI() {
        // Left Column Updates
        diceDisplay.innerText = state.lastRoll;
        
        // Add pop animation
        diceDisplay.classList.remove("animate-pop");
        void diceDisplay.offsetWidth; // trigger reflow
        diceDisplay.classList.add("animate-pop");

        pendingScoreDisplay.innerText = `${state.pendingScore} 점`;
        
        setActionButtonsEnabled(!state.gameOver && !state.turnTransitioning);

        if(state.gameOver) {
            gameOverMsg.classList.remove("d-none");
            document.getElementById("winnerName").innerText = state.winner;
        } else {
            gameOverMsg.classList.add("d-none");
        }

        if(state.turnOverMessage) {
            turnOverMsg.innerText = state.turnOverMessage;
            turnOverMsg.classList.remove("d-none");
            if (state.turnOverMessage.includes("앗!")) {
                turnOverMsg.className = "fw-bold ms-3 text-danger";
            } else {
                turnOverMsg.className = "fw-bold ms-3 text-success";
            }
        } else {
            turnOverMsg.classList.add("d-none");
        }

        // Right Column (Scoreboard) Updates
        const activePlayerName = state.playerNames[state.currentPlayer];
        scoreboardTitle.innerHTML = `scoreboard - 현재 <strong>${activePlayerName}</strong>`;
        
        scoreboardContainer.innerHTML = "";

        for (let i = 0; i < state.numPlayers; i++) {
            const isCurrentPlayer = (i === state.currentPlayer);
            const playerName = state.playerNames[i];
            const headerText = isCurrentPlayer ? `👑 ${playerName}` : playerName;
            const playerScore = state.playerScores[i];
            const deltaScore = (isCurrentPlayer && !state.gameOver) ? state.pendingScore : 0;
            
            const col = document.createElement("div");
            col.className = "flex-fill mb-3";
            col.style.minWidth = "120px";
            
            col.innerHTML = `
                <div class="player-score-card">
                    <div class="player-name">${headerText}</div>
                    <div class="score-label">총 점수</div>
                    <div class="total-score">${playerScore}</div>
                    <div class="delta-score">${deltaScore > 0 ? '↑ ' + deltaScore + ' 점' : ''}</div>
                </div>
            `;
            scoreboardContainer.appendChild(col);
        }

        updateStats();
    }

    function updateStats() {
        if (state.rollHistory.length === 0) return;

        chartEmptyMsg.classList.add("d-none");
        chartCanvasWrapper.classList.remove("d-none");
        statsEmptyMsg.classList.add("d-none");
        statsData.classList.remove("d-none");

        // Calculate frequencies and ratios
        const counts = {1:0, 2:0, 3:0, 4:0, 5:0, 6:0};
        state.rollHistory.forEach(r => { counts[r]++; });
        const totalRolls = state.rollHistory.length;

        const labels = ['1', '2', '3', '4', '5', '6'];
        const dataRatio = labels.map(l => counts[l] / totalRolls);

        // Update Chart
        if (!chartInstance) {
            const ctx = diceChartCanvas.getContext('2d');
            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '비율',
                        data: dataRatio,
                        borderColor: '#0d6efd',
                        backgroundColor: '#0d6efd',
                        tension: 0.4, // spline effect
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: 0,
                            max: 1,
                            title: { display: true, text: '비율' }
                        },
                        x: {
                            title: { display: true, text: '주사위 눈' }
                        }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        } else {
            chartInstance.data.datasets[0].data = dataRatio;
            chartInstance.update();
        }

        // Update Table
        for(let i=1; i<=6; i++) {
            document.getElementById(`freq${i}`).innerText = counts[i];
            document.getElementById(`ratio${i}`).innerText = (counts[i] / totalRolls).toFixed(3);
        }
    }
});
