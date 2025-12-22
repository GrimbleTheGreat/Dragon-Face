// sabacc.js

// --- Configuration ---
const suits = ['square', 'circle', 'triangle'];
const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 1-10
const colors = ['green', 'red'];

let deck = [];
let playerHand = [];
let dealerHand = [];
let gameOver = false;

// DOM Elements
const dealerCardsEl = document.getElementById('dealer-cards');
const playerCardsEl = document.getElementById('player-cards');
const dealerScoreEl = document.getElementById('dealer-score');
const playerScoreEl = document.getElementById('player-score');
const statusMsg = document.getElementById('status-msg');
const hitBtn = document.getElementById('hit-btn');
const standBtn = document.getElementById('stand-btn');
const newGameBtn = document.getElementById('new-game-btn');

// --- Event Listeners ---
hitBtn.addEventListener('click', () => {
    playerHand.push(drawCard());
    renderGame();
    // Sabacc doesn't "Bust" instantly at 21, but we check ranges if you want
    // For now, we just let them play until they Stand.
});

standBtn.addEventListener('click', () => {
    dealerTurn();
});

newGameBtn.addEventListener('click', startGame);

// --- Game Logic ---

function createDeck() {
    deck = [];

    // 1. Create the 60 Standard Cards (30 Green, 30 Red)
    for (let color of colors) {
        for (let suit of suits) {
            for (let val of values) {
                // Determine actual math value (Red is negative)
                let mathValue = (color === 'green') ? val : -val;

                deck.push({
                    type: 'standard',
                    displayVal: val, // The number shown on card (always positive)
                    value: mathValue, // The math value (can be negative)
                    suit: suit,
                    color: color,
                    // Filename hook for your future art: e.g. "red_triangle_5.png"
                    img: `${color}_${suit}_${val}.png`
                });
            }
        }
    }

    // 2. Add 2 Sylops (The "Zero" cards)
    for (let i = 0; i < 2; i++) {
        deck.push({
            type: 'sylop',
            displayVal: 0,
            value: 0,
            suit: 'none',
            color: 'black',
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
    return deck.pop();
}

function calculateScore(hand) {
    let score = 0;
    for (let card of hand) {
        score += card.value;
    }
    return score;
}

function startGame() {
    createDeck();
    shuffleDeck();

    // Deal 2 cards each
    playerHand = [drawCard(), drawCard()];
    dealerHand = [drawCard(), drawCard()];

    gameOver = false;
    hitBtn.disabled = false;
    standBtn.disabled = false;
    newGameBtn.style.display = 'none';
    statusMsg.innerText = "Gain, Swap, or Stand?";

    renderGame();
}

function dealerTurn() {
    // Simple AI: Dealer tries to get close to 0
    // If score is less than -5, Gain (to get positive)
    // If score is more than 5, Gain (hope for negative?) - Basic logic for now
    let score = calculateScore(dealerHand);

    // Very basic Sabacc AI: Hit if far from 0
    while (Math.abs(score) > 5) {
        dealerHand.push(drawCard());
        score = calculateScore(dealerHand);
    }
    determineWinner();
}

function determineWinner() {
    const pScore = Math.abs(calculateScore(playerHand)); // Absolute distance from 0
    const dScore = Math.abs(calculateScore(dealerHand));

    let msg = "";

    // In Sabacc, lower absolute score wins (closest to 0)
    if (pScore < dScore) {
        msg = "You Win! (Closer to 0)";
    } else if (dScore < pScore) {
        msg = "Dealer Wins.";
    } else {
        msg = "It's a Tie (Push).";
    }

    endGame(`${msg} P:${calculateScore(playerHand)} D:${calculateScore(dealerHand)}`);
}

function endGame(message) {
    gameOver = true;
    statusMsg.innerText = message;
    hitBtn.disabled = true;
    standBtn.disabled = true;
    newGameBtn.style.display = 'inline-block';
    renderGame();
}

// --- UI Rendering ---

function renderGame() {
    playerCardsEl.innerHTML = '';
    dealerCardsEl.innerHTML = '';

    playerHand.forEach(card => playerCardsEl.appendChild(createCardElement(card)));

    // In Sabacc, we usually show scores as-is
    playerScoreEl.innerText = calculateScore(playerHand);

    dealerHand.forEach((card, index) => {
        if (index === 0 && !gameOver) {
            const hiddenDiv = document.createElement('div');
            hiddenDiv.className = 'card hidden-card';
            dealerCardsEl.appendChild(hiddenDiv);
        } else {
            dealerCardsEl.appendChild(createCardElement(card));
        }
    });

    if (gameOver) {
        dealerScoreEl.innerText = calculateScore(dealerHand);
    } else {
        dealerScoreEl.innerText = "?";
    }
}

function createCardElement(card) {
    const div = document.createElement('div');

    // 1. Assign Basic Classes
    div.className = `card ${card.color}`;

    // 2. Future Image Hook:
    // Once you have images, uncomment the line below to use them!
    // div.style.backgroundImage = `url('images/${card.img}')`;
    // div.style.backgroundSize = 'cover';

    // 3. For NOW: Text Fallback
    // We create a symbol for the suit
    let suitSymbol = '';
    if (card.suit === 'square') suitSymbol = '■';
    else if (card.suit === 'circle') suitSymbol = '●';
    else if (card.suit === 'triangle') suitSymbol = '▲';
    else if (card.type === 'sylop') suitSymbol = '❖';

    div.innerHTML = `<span>${card.displayVal}</span><span style="font-size:14px">${suitSymbol}</span>`;

    return div;
}

// Rules Tabs Function
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

// Initialize
startGame();