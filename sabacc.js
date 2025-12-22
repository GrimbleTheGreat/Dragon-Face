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
        console.log("Initializing Peer...");
        this.ui.menu.style.display = 'none';
        this.ui.controls.style.display = 'flex';
        this.ui.idDisplay.innerText = "Generating ID...";

        // 1. STUN Server Config (Helps computers find each other)
        const peerConfig = {
            debug: 2, // Print errors to console
            config: {
                'iceServers': [
                    { url: 'stun:stun.l.google.com:19302' },
                    { url: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        };

        // 2. Create the Peer
        try {
            this.peer = new Peer(null, peerConfig);
        } catch (e) {
            console.error("PeerJS Failed to Start:", e);
            alert("PeerJS failed. Are you using a Local Server?");
            return;
        }

        // 3. Listen for ID Generation (Success)
        this.peer.on('open', (id) => {
            console.log("My Peer ID is:", id);
            this.myId = id;
            this.ui.idDisplay.innerText = id;

            if (asHost) {
                isHost = true;
                this.ui.status.innerText = "Waiting for Player 2...";
                this.ui.status.style.color = "yellow";
            } else {
                isHost = false;
                this.ui.status.innerText = "Connecting to Host...";
                this.ui.status.style.color = "yellow";
                console.log("Attempting connection to:", hostId);
                this.connectToHost(hostId);
            }
        });

        // 4. Listen for Connection Errors
        this.peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
            this.ui.status.innerText = "Error: " + err.type;
            this.ui.status.style.color = "red";

            if (err.type === 'peer-unavailable') {
                alert("Could not find that Host ID. Did they close the tab?");
            } else if (err.type === 'browser-incompatible') {
                alert("Your browser doesn't support WebRTC (Multiplayer).");
            }
        });

        // 5. Incoming Connection (Host Logic)
        this.peer.on('connection', (conn) => {
            console.log("Incoming connection from:", conn.peer);
            this.handleConnection(conn);
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
        if (isHost) {
            // Host Ends Game: Calculate Winner AND Send hands to client
            determineWinner(myHand, opponentHandFromMemory); // Note: We need to store P2 hand

            // SEND GAME OVER TO CLIENT
            mp.send({
                type: 'GAME_OVER',
                hostHand: myHand,
                winnerMsg: statusMsg.innerText
                // Note: Real logic would calculate msg for client perspective
            });

        } else {
            // Client Stands: Tell Host
            mp.send({ type: 'ACTION_STAND' });
            statusMsg.innerText = "Waiting for Host...";
            hitBtn.disabled = true;
            standBtn.disabled = true;
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
    // 1. Clear the table first (Prevents the "Double Hand" bug)
    playerCardsEl.innerHTML = '';
    dealerCardsEl.innerHTML = '';

    // 2. Render My Hand (Fan Logic)
    renderHand(myHand, playerCardsEl, true);
    playerScoreEl.innerText = calculateScore(myHand);

    // 3. Render Opponent Hand
    if (isMultiplayer) {
        // Multiplayer: Always hidden until we add "Reveal" network event
        renderHand(opponentHand, dealerCardsEl, false);
        dealerScoreEl.innerText = "?";
    } else {
        // Single Player Logic
        opponentHand.forEach((card) => {
            if (gameActive) {
                // GAME ACTIVE: Show Hidden Backs
                const hiddenDiv = document.createElement('div');
                hiddenDiv.className = 'card hidden-card';
                dealerCardsEl.appendChild(hiddenDiv);
            } else {
                // GAME OVER: Reveal everything
                dealerCardsEl.appendChild(createCardElement(card));
            }
        });

        // 4. Update Dealer Score
        if (!gameActive) {
            dealerScoreEl.innerText = calculateScore(opponentHand);
        } else {
            dealerScoreEl.innerText = "?";
        }
    }

    // 5. Button States
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
// --- WINNING LOGIC ---

function dealerTurnAI() {
    gameActive = false;
    determineWinner(myHand, opponentHand);
}

function getHandRank(hand) {
    const score = calculateScore(hand);
    const absScore = Math.abs(score);
    const count = hand.length;

    // Check for specific cards
    const sylops = hand.filter(c => c.value === 0).length;
    const hasPos10 = hand.some(c => c.value === 10);
    const hasNeg10 = hand.some(c => c.value === -10);

    // RANK 1: Pure Sabacc (Two Sylops)
    if (count === 2 && sylops === 2) {
        return { tier: 1, name: "Pure Sabacc!", score: 0 };
    }

    // RANK 2: Prime Sabacc (+10 and -10)
    if (count === 2 && hasPos10 && hasNeg10) {
        return { tier: 2, name: "Prime Sabacc!", score: 0 };
    }

    // RANK 3: Yee-Ha (Sylop + Pair)
    // We check if there is a Sylop AND if the other cards form a pair
    if (sylops > 0 && count >= 3) {
        // Simple check: do we have a pair in the remaining cards?
        // For this prototype, we'll trust the 0 score with a Sylop is a Yee-Ha
        if (score === 0) return { tier: 3, name: "Yee-Ha!", score: 0 };
    }

    // RANK 4: Regular Hand (Ranked by distance to 0)
    return { tier: 4, name: "Hand", score: absScore };
}

function determineWinner(pHand, dHand) {
    const pRank = getHandRank(pHand);
    const dRank = getHandRank(dHand);

    let message = "";

    // 1. Compare Tiers (Lower tier number is better)
    if (pRank.tier < dRank.tier) {
        message = `You Win with ${pRank.name}`;
    } else if (dRank.tier < pRank.tier) {
        message = `Opponent Wins with ${dRank.name}`;
    } else {
        // 2. Tiers are equal (usually Tier 4), compare Absolute Score
        if (pRank.score < dRank.score) { // Closer to 0 wins
            message = "You Win! (Closer to 0)";
        } else if (dRank.score < pRank.score) {
            message = "Opponent Wins. (Closer to 0)";
        } else {
            message = "It's a Tie (Push).";
        }
    }

    // Update UI
    statusMsg.innerText = message;
    newGameBtn.style.display = 'inline-block';

    // Force Game Over state for UI to reveal cards
    gameActive = false;
    updateUI();
}