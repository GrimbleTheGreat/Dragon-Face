// blackjack.js

const suits = ['♥', '♦', '♣', '♠'];
const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

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
    checkForBust();
});

standBtn.addEventListener('click', () => {
    dealerTurn();
});

newGameBtn.addEventListener('click', startGame);

// --- Game Logic ---

function createDeck() {
    deck = [];
    for (let suit of suits) {
        for (let value of values) {
            deck.push({ suit, value });
        }
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

function getCardValue(card) {
    if (['J', 'Q', 'K'].includes(card.value)) return 10;
    if (card.value === 'A') return 11;
    return parseInt(card.value);
}

function calculateScore(hand) {
    let score = 0;
    let aceCount = 0;

    for (let card of hand) {
        score += getCardValue(card);
        if (card.value === 'A') aceCount++;
    }

    // Adjust for Aces if over 21
    while (score > 21 && aceCount > 0) {
        score -= 10;
        aceCount--;
    }
    return score;
}

function startGame() {
    createDeck();
    shuffleDeck();
    playerHand = [drawCard(), drawCard()];
    dealerHand = [drawCard(), drawCard()];
    gameOver = false;

    hitBtn.disabled = false;
    standBtn.disabled = false;
    newGameBtn.style.display = 'none';
    statusMsg.innerText = "Hit or Stand?";

    renderGame();
}

function checkForBust() {
    const pScore = calculateScore(playerHand);
    if (pScore > 21) {
        endGame("You Busted! Dealer Wins.");
    }
}

function dealerTurn() {
    // Dealer hits until 17 or higher
    while (calculateScore(dealerHand) < 17) {
        dealerHand.push(drawCard());
    }
    determineWinner();
}

function determineWinner() {
    const pScore = calculateScore(playerHand);
    const dScore = calculateScore(dealerHand);

    if (dScore > 21) {
        endGame("Dealer Busted! You Win!");
    } else if (pScore > dScore) {
        endGame("You Win!");
    } else if (pScore < dScore) {
        endGame("Dealer Wins.");
    } else {
        endGame("It's a Tie (Push).");
    }
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

    // Render Player Cards
    playerHand.forEach(card => playerCardsEl.appendChild(createCardElement(card)));
    playerScoreEl.innerText = calculateScore(playerHand);

    // Render Dealer Cards
    dealerHand.forEach((card, index) => {
        if (index === 0 && !gameOver) {
            // Face down card logic
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
    div.className = `card ${['♥', '♦'].includes(card.suit) ? 'red' : 'black'}`;
    div.innerText = `${card.value}${card.suit}`;
    return div;
}

// Initialize on load
startGame();