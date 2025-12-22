// sabacc.js

// --- CONFIGURATION ---
const suits = ['square', 'circle', 'triangle'];
const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const colors = ['green', 'red'];

// --- GAME STATE ---
let deck = [];
let myHand = [];
let opponentHand = []; // For display purposes (backs only)
let isMyTurn = false;
let gameActive = false;
let isHost = false; // Am I the server?
let isMultiplayer = false;

// --- DOM ELEMENTS ---
const dealerCardsEl = document.getElementById('dealer-cards');
const playerCardsEl = document.getElementById('player-cards');
const dealerScoreEl = document.getElementById('dealer-score');
const playerScoreEl = document.getElementById('player-score');
const statusMsg = document.getElementById('status-msg');
const hitBtn = document.getElementById('hit-btn');
const standBtn = document.getElementById('stand-btn');
const newGameBtn = document.getElementById('new-game-btn');

// --- MULTIPLAYER CLASS ---
class MultiplayerHandler {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.peer = null;
        this.conn = null;
        this.myId = null;

        // UI Elements
        this.ui = {
            menu: document.getElementById('mp-menu'),
            controls: document.getElementById('network-controls'),
            hostBtn: document.getElementById('host-btn'),
            joinBtn: document.getElementById('join-btn'),
            joinInput: document.getElementById('join-id-input'),
            idDisplay: document.getElementById('player-id'),
            status: document.getElementById('connection-status'),
            copyBtn: document.getElementById('copy-btn')
        };

        this.initListeners();
    }

    initListeners() {
        this.ui.hostBtn.addEventListener('click', () => this.initPeer(true));

        this.ui.joinBtn.addEventListener('click', () => {
            const hostId = this.ui.joinInput.value;
            if (hostId) this.initPeer(false, hostId);
        });

        this.ui.copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(this.myId);
            this.ui.copyBtn.innerText = "Copied!";
            setTimeout(() => this.ui.copyBtn.innerText = "Copy ID", 2000);
        });
    }

    initPeer(asHost, hostId = null) {
        this.ui.menu.style.display = 'none';
        this.ui.controls.style.display = 'flex';
        this.ui.idDisplay.innerText = "Generating...";

        this.peer = new Peer(); // Create PeerJS instance

        this.peer.on('open', (id) => {
            this.myId = id;
            this.ui.idDisplay.innerText = id;

            if (asHost) {
                isHost = true;
                this.ui.status.innerText = "Waiting for Player 2...";
            } else {
                isHost = false;
                this.ui.status.innerText = "Connecting to Host...";
                this.connectToHost(hostId);
            }
        });

        this.peer.on('connection', (conn) => {
            this.handleConnection(conn);
        });

        this.peer.on('error', (err) => {
            alert("Connection Error: " + err.type);
            location.reload(); // Simple reset on error
        });
    }

    connectToHost(hostId) {
        const conn = this.peer.connect(hostId);
        this.handleConnection(conn);
    }

    handleConnection(conn) {
        this.conn = conn;

        this.conn.on('open', () => {
            this.ui.status.innerText = "Connected!";
            this.ui.status.style.color = "#2ecc71";
            isMultiplayer = true;
            this.callbacks.onConnected();
        });

        this.conn.on('data', (data) => {
            this.callbacks.onData(data);
        });

        this.conn.on('close', () => {
            alert("Connection Lost");
            location.reload();
        });
    }

    send(data) {
        if (this.conn) this.conn.send(data);
    }
}

// --- INIT MULTIPLAYER ---
const mp = new MultiplayerHandler({
    onConnected: () => {
        // Only Host can start the game
        if (isHost) {
            newGameBtn.style.display = 'inline-block';
            statusMsg.innerText = "Connected! Start New Game.";
        } else {
            newGameBtn.style.display = 'none';
            statusMsg.innerText = "Waiting for Host to start...";
        }
    },
    onData: (data) => {
        handleNetworkData(data);
    }
});


// --- GAME LOGIC ---

// 1. Start Game (Host Only in MP)
newGameBtn.addEventListener('click', () => {
    if (isMultiplayer && !isHost) return;
    startNewGame();
});

function startNewGame() {
    createDeck();
    shuffleDeck();

    // Deal Initial Hands
    const p1 = [drawCard(), drawCard()];
    const p2 = [drawCard(), drawCard()];

    // If Single Player
    if (!isMultiplayer) {
        myHand = p1;
        opponentHand = p2;
        isMyTurn = true;

        // --- FIX: TURN THE GAME ON! ---
        gameActive = true;

        updateUI();
        return;
    }

    // If Multiplayer (Host Logic)
    myHand = p1;

    // SEND DATA TO CLIENT (Player 2)
    mp.send({
        type: 'START_GAME',
        hand: p2,
        opponentCount: 2
    });

    isMyTurn = true;
    // Host also needs the game to be active
    gameActive = true;
    updateUI();
}

// 2. Player Actions
hitBtn.addEventListener('click', () => {
    if (isMultiplayer) {
        // Request move from Host
        if (isHost) {
            // I am host, I just do it
            myHand.push(drawCard());
            syncGameState();
        } else {
            // I am client, I ask Host
            mp.send({ type: 'ACTION_GAIN' });
        }
    } else {
        // Single Player
        myHand.push(drawCard());
        updateUI();
    }
});

standBtn.addEventListener('click', () => {
    if (isMultiplayer) {
        // For 2-player simple prototype: Stand simply ends game for now to show scores
        // In real game it would pass turn.
        if (isHost) {
            determineWinner(myHand, opponentHandFromMemory); // Host needs to track opp hand
        } else {
            mp.send({ type: 'ACTION_STAND' });
        }
    } else {
        dealerTurnAI();
    }
});


// --- NETWORK DATA HANDLER ---
// Tracks opponent's hand for Host logic
let opponentHandFromMemory = [];

function handleNetworkData(data) {
    console.log("Received:", data);

    // CLIENT RECEIVES:
    if (data.type === 'START_GAME') {
        myHand = data.hand;
        opponentHand = Array(data.opponentCount).fill({ type: 'hidden' }); // Dummy cards
        isMyTurn = false; // Client waits
        gameActive = true;
        updateUI();
        statusMsg.innerText = "Host started game. Host's turn.";
    }

    if (data.type === 'UPDATE_STATE') {
        myHand = data.hand;
        opponentHand = Array(data.opponentCount).fill({ type: 'hidden' });
        updateUI();
    }

    // HOST RECEIVES:
    if (isHost) {
        if (data.type === 'ACTION_GAIN') {
            // Client wants a card
            // Logic: Host keeps track of P2's hand in a separate variable in a real app
            // For this simple prototype, we rely on the fact that P2's hand 
            // is not strictly tracked in variable `opponentHand` for logic yet.
            // *Fixing Host Tracking for P2:*
            if (opponentHandFromMemory.length === 0) {
                // On start game, host should have saved P2 hand.
                // This requires a refactor of startNewGame to save P2 hand globally.
            }

            // Simplified: Host draws card, sends it to Client
            const newCard = drawCard();
            mp.send({
                type: 'RECEIVE_CARD',
                card: newCard
            });
            statusMsg.innerText = "Opponent Gained a card.";
        }
    }

    // CLIENT RECEIVES CARD
    if (data.type === 'RECEIVE_CARD') {
        myHand.push(data.card);
        updateUI();
    }
}


// --- HELPER FUNCTIONS ---

function createDeck() {
    deck = [];
    for (let color of colors) {
        for (let suit of suits) {
            for (let val of values) {
                let mathValue = (color === 'green') ? val : -val;
                deck.push({
                    type: 'standard',
                    displayVal: val,
                    value: mathValue,
                    suit: suit,
                    color: color,
                    img: `${color}_${suit}_${val}.png`
                });
            }
        }
    }
    // Sylops
    for (let i = 0; i < 2; i++) {
        deck.push({
            type: 'sylop',
            displayVal: 0,
            value: 0,
            suit: 'none',
            color: 'black', // Defaulted to black for now
            img: `sylop.png`
        });
    }
}

function shuffleDeck() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function drawCard() {
    if (deck.length === 0) return null; // Handle empty deck
    return deck.pop();
}

function calculateScore(hand) {
    let score = 0;
    for (let card of hand) {
        score += card.value;
    }
    return score;
}

// --- UI UPDATES ---

function updateUI() {
    playerCardsEl.innerHTML = '';
    dealerCardsEl.innerHTML = '';

    // Render My Hand (Fan Logic)
    renderHand(myHand, playerCardsEl, true);
    playerScoreEl.innerText = calculateScore(myHand);

    // Render Opponent Hand
    if (isMultiplayer) {
        renderHand(opponentHand, dealerCardsEl, false);
        dealerScoreEl.innerText = "?";
    } else {
        // Single Player Logic
        opponentHand.forEach((card) => {
            // FIX: If game is active, HIDE EVERYTHING.
            if (gameActive) {
                const hiddenDiv = document.createElement('div');
                hiddenDiv.className = 'card hidden-card';

                // Add the inner face for the border trick
                const inner = document.createElement('div');
                hiddenDiv.appendChild(inner);

                dealerCardsEl.appendChild(hiddenDiv);
            } else {
                // Game Over: Show the actual cards
                dealerCardsEl.appendChild(createCardElement(card));
            }
        });
    }

    // Button States
    if (myHand.length > 0 && gameActive) {
        hitBtn.disabled = false;
        standBtn.disabled = false;
        newGameBtn.style.display = 'none';
    } else {
        hitBtn.disabled = true;
        standBtn.disabled = true;
    }
}

function renderHand(hand, container, isFan) {
    const totalCards = hand.length;
    hand.forEach((card, index) => {
        // Handle Hidden Cards in MP
        if (card.type === 'hidden') {
            const hiddenDiv = document.createElement('div');
            hiddenDiv.className = 'card hidden-card';
            container.appendChild(hiddenDiv);
            return;
        }

        const cardEl = createCardElement(card);

        if (isFan) {
            const spread = 10;
            const rotation = (index - (totalCards - 1) / 2) * spread;
            const yOffset = Math.abs(rotation) * 1.5;
            cardEl.style.transform = `rotate(${rotation}deg) translateY(${yOffset}px)`;
        }

        container.appendChild(cardEl);
    });
}

function createCardElement(card) {
    const div = document.createElement('div');
    div.className = `card ${card.color}`;

    // IMAGE HOOK (Commented out until you have images)
    // div.style.backgroundImage = `url('images/${card.img}')`;
    // div.style.backgroundSize = 'cover';
    // div.style.backgroundPosition = 'center';

    // TEXT FALLBACK
    let suitSymbol = '';
    if (card.suit === 'square') suitSymbol = '■';
    else if (card.suit === 'circle') suitSymbol = '●';
    else if (card.suit === 'triangle') suitSymbol = '▲';
    else if (card.type === 'sylop') suitSymbol = '❖';

    div.innerHTML = `<span>${card.displayVal}</span><span style="font-size:14px">${suitSymbol}</span>`;
    return div;
}

// Rules Tabs
function openTab(evt, tabName) {
    const tabContents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
    }
    const tabButtons = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < tabButtons.length; i++) {
        tabButtons[i].classList.remove("active-tab");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.classList.add("active-tab");
}

// Single Player AI (Game Over Logic)
function dealerTurnAI() {
    // 1. End the game state
    gameActive = false;

    // 2. Update status
    statusMsg.innerText = "Game Over.";
    newGameBtn.style.display = 'inline-block';

    // 3. Let the main UI function redraw the board (clearing the hidden cards)
    updateUI();
}