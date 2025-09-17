/*
This file contains all the game logic for Dragon Face. It handles creating the board,
managing player turns, calculating piece moves, and updating the game state.
*/

document.addEventListener('DOMContentLoaded', () => {

    // --- UI and Board Elements ---
    const multiplayerBtn = document.getElementById('multiplayer-btn');
    const networkControls = document.getElementById('network-controls');
    const playerIdSpan = document.getElementById('player-id');
    const joinIdInput = document.getElementById('join-id-input');
    const joinBtn = document.getElementById('join-btn');

    // --- PeerJS Networking State ---
    let peer;
    let conn;
    let playerNumber; // Is undefined for hotseat, 1 or 2 for online

    // --- Multiplayer Initialization ---

    multiplayerBtn.addEventListener('click', () => {
        multiplayerBtn.style.display = 'none';
        networkControls.style.display = 'flex';
        statusDisplay.textContent = "Connecting to server...";
        initializePeer();
    });

    function initializePeer() {
        peer = new Peer();
        // HOST: When connection to server is open, get and display your ID.
        peer.on('open', (id) => {
            playerNumber = 1; // The first person to click is the host (Player 1)
            playerIdSpan.textContent = id;
            statusDisplay.textContent = "Share your code with a friend!";
        });
        // HOST: When a joiner connects to you.
        peer.on('connection', (connection) => {
            conn = connection;
            networkControls.style.display = 'none';
            setupConnectionEvents();
            updateStatusDisplay();
        });
    }

    joinBtn.addEventListener('click', () => {
        const joinId = joinIdInput.value;
        if (joinId) {
            conn = peer.connect(joinId);
            // JOINER: When your connection to the host is successful.
            conn.on('open', () => {
                playerNumber = 2; // You successfully joined, you are Player 2
                networkControls.style.display = 'none';
                setupConnectionEvents();
                updateStatusDisplay();
            });
        }
    });

    function setupConnectionEvents() {
        if (conn) {
            conn.on('data', (data) => {
                if (data.type === 'move') {
                    movePiece(data.move.startRow, data.move.startCol, data.move.move);
                }
            });
        }
    }

    // --- Game Board and Display Elements ---
    const boardElement = document.getElementById('game-board');
    const statusDisplay = document.getElementById('status-display');
    const rows = 11;
    const cols = 9;

    // --- Game State Variables ---
    let boardState = [];
    let currentPlayer = 1;
    let selectedPiece = null;
    let validMoves = [];
    let isGameOver = false;
    let lastFlippedPieceCoords = null;
    let promotionState = null;

    // --- Piece Definitions ---
    const P1G = { type: 'governor', player: 1, hasMoved: false, isTrapped: false };
    const P1A = { type: 'ambassador', player: 1, isTrapped: false };
    const P1E = { type: 'emperor', player: 1, isTrapped: false };
    const P2G = { type: 'governor', player: 2, hasMoved: false, isTrapped: false };
    const P2A = { type: 'ambassador', player: 2, isTrapped: false };
    const P2E = { type: 'emperor', player: 2, isTrapped: false };

    const initialLayout = [
        [null, null, null, null, null, null, null, null, null],
        [null, P2A, P2A, P2A, P2E, P2A, P2A, P2A, null],
        [null, P2G, P2G, P2G, P2G, P2G, P2G, P2G, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null],
        [null, P1G, P1G, P1G, P1G, P1G, P1G, P1G, null],
        [null, P1A, P1A, P1A, P1E, P1A, P1A, P1A, null],
        [null, null, null, null, null, null, null, null, null]
    ];

    // --- Core Game Functions ---
    function handleSquareClick(event) {
        if (playerNumber && currentPlayer !== playerNumber) return;
        if (isGameOver) return;
        if (promotionState) {
            handlePromotionClick(row, col);
            return;
        }
        const square = event.target.closest('.square');
        if (!square) return;
        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);
        if (selectedPiece) {
            const move = validMoves.find(m => m.r === row && m.c === col);
            if (move) {
                if (conn) {
                    conn.send(
                        {
                            type: 'move', move: { startRow: selectedPiece.row, startCol: selectedPiece.col, move: move }
                        }
                    );
                }
                movePiece(selectedPiece.row, selectedPiece.col, move);
            }
            clearSelection();
        } else {
            const pieceData = boardState[row][col];
            if (pieceData && (!playerNumber || pieceData.player === currentPlayer) && !pieceData.isTrapped) {
                selectPiece(row, col);
            }
        }
    }

    function movePiece(startRow, startCol, move) {
        const pieceToMove = boardState[startRow][startCol];
        let capturedCoords = null;
        if (move.type === 'capture') {
            const jumpedPiece = boardState[move.jumped.r][move.jumped.c];
            if (jumpedPiece.type === 'emperor') {
                endGame(currentPlayer);
                return;
            }
            jumpedPiece.player = currentPlayer;
            capturedCoords = { r: move.jumped.r, c: move.jumped.c };
        }
        if (pieceToMove.type === 'governor' && pieceToMove.hasMoved === false) {
            pieceToMove.hasMoved = true;
        }
        if (!isPlayableSquare(move.r, move.c)) {
            pieceToMove.isTrapped = true;
        }
        boardState[startRow][startCol] = null;
        boardState[move.r][move.c] = pieceToMove;
        const enteredPromotion = handleGovernorPromotion(move.r, move.c, pieceToMove);
        if (enteredPromotion) {
            renderPieces();
            return;
        }
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        lastFlippedPieceCoords = capturedCoords;
        renderPieces();
        updateStatusDisplay();
    }

    // --- Special Game Mechanics ---

    // This handles clicks ONLY when the game is in 'rescue mode'.
    function handlePromotionClick(row, col) {
        const trappedAmbassadors = findTrappedAmbassadors(currentPlayer);
        const isClickValid = trappedAmbassadors.some(ambassador => ambassador.r === row && ambassador.c === col);

        if (isClickValid) {
            // It's a valid click, so perform the swap.
            const govCoords = promotionState.governorCoords;
            const governorPiece = boardState[govCoords.r][govCoords.c];
            const ambassadorPiece = boardState[row][col];

            // Activate the Ambassador and trap the Governor
            ambassadorPiece.isTrapped = false;
            governorPiece.isTrapped = true;

            // Swap their positions on the board
            boardState[govCoords.r][govCoords.c] = ambassadorPiece;
            boardState[row][col] = governorPiece;

            // Exit rescue mode and end the turn.
            clearSelection();
            promotionState = null;
            currentPlayer = currentPlayer === 1 ? 2 : 1;
            renderPieces();
            updateStatusDisplay();
        }
    }

    // This function checks for the promotion condition and activates 'rescue mode'.
    // It replaces the old checkForGovernorPromotion function.
    function handleGovernorPromotion(endRow, endCol, movedPiece) {
        if (movedPiece.type !== 'governor') return false;

        const promotionRow = movedPiece.player === 1 ? 1 : 9;
        if (endRow === promotionRow) {
            const trappedAmbassadors = findTrappedAmbassadors(movedPiece.player);
            if (trappedAmbassadors.length > 0) {
                // Enter rescue mode!
                promotionState = { governorCoords: { r: endRow, c: endCol } };
                validMoves = trappedAmbassadors; // Use validMoves to store rescue targets
                highlightValidMoves();
                statusDisplay.textContent = `Player ${movedPiece.player}, choose an Ambassador to rescue!`;
                return true; // Signal that we entered rescue mode
            }
        }
        return false; // No rescue occurred
    }

    // This is to find all of a player's trapped Ambassadors.
    function findTrappedAmbassadors(player) {
        const ambassadors = [];
        for (let r = 0; r < 11; r++) {
            for (let c = 0; c < 9; c++) {
                const piece = boardState[r][c];
                if (piece && piece.player === player && piece.type === 'ambassador' && piece.isTrapped) {
                    ambassadors.push({ r, c });
                }
            }
        }
        return ambassadors;
    }

    // --- Move Calculation Logic ---
    function getGovernorMoves(r, c, player) {
        const moves = [];
        const piece = boardState[r][c];
        const forwardDir = player === 1 ? -1 : 1;
        for (let dc = -1; dc <= 1; dc++) {
            const newR = r + forwardDir;
            const newC = c + dc;
            if (isPlayableSquare(newR, newC) && boardState[newR][newC] === null) {
                moves.push({ r: newR, c: newC, type: 'move' });
            }
        }
        if (piece.hasMoved === false) {
            for (let dc = -1; dc <= 1; dc++) {
                const oneStepR = r + forwardDir;
                const oneStepC = c + dc;
                const twoStepsR = r + (2 * forwardDir);
                const twoStepsC = c + (2 * dc);
                if (isPlayableSquare(twoStepsR, twoStepsC) && boardState[oneStepR][oneStepC] === null && boardState[twoStepsR][twoStepsC] === null) {
                    moves.push({ r: twoStepsR, c: twoStepsC, type: 'move' });
                }
            }
        }
        for (let dc = -1; dc <= 1; dc++) {
            if (dc === 0) continue;
            const jumpedR = r + forwardDir;
            const jumpedC = c + dc;
            const jumpToR = r + (2 * forwardDir);
            const jumpToC = c + (2 * dc);
            const jumpedPiece = boardState[jumpedR]?.[jumpedC];
            const isImmune = lastFlippedPieceCoords && jumpedR === lastFlippedPieceCoords.r && jumpedC === lastFlippedPieceCoords.c;
            if (!isImmune && isWithinBoardBounds(jumpToR, jumpToC) && boardState[jumpToR][jumpToC] === null && jumpedPiece && jumpedPiece.player !== currentPlayer) {
                moves.push({ r: jumpToR, c: jumpToC, type: 'capture', jumped: { r: jumpedR, c: jumpedC } });
            }
        }
        return moves;
    }

    function getAmbassadorMoves(r, c) {
        const moves = [];
        const directions = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }, { r: -1, c: -1 }, { r: -1, c: 1 }, { r: 1, c: -1 }, { r: 1, c: 1 }];
        for (const dir of directions) {
            let newR = r + dir.r;
            let newC = c + dir.c;
            while (isPlayableSquare(newR, newC)) {
                if (boardState[newR][newC] === null) {
                    moves.push({ r: newR, c: newC, type: 'move' });
                    newR += dir.r;
                    newC += dir.c;
                } else {
                    break;
                }
            }
            const jumpedR = newR;
            const jumpedC = newC;
            const jumpedPiece = boardState[jumpedR]?.[jumpedC];
            const jumpToR = newR + dir.r;
            const jumpToC = newC + dir.c;
            const isImmune = lastFlippedPieceCoords && jumpedR === lastFlippedPieceCoords.r && jumpedC === lastFlippedPieceCoords.c;
            if (!isImmune && isWithinBoardBounds(jumpToR, jumpToC) && boardState[jumpToR][jumpToC] === null && jumpedPiece && jumpedPiece.player !== currentPlayer) {
                moves.push({ r: jumpToR, c: jumpToC, type: 'capture', jumped: { r: newR, c: newC } });
            }
        }
        return moves;
    }

    function getEmperorMoves(r, c) {
        const moves = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const newR = r + dr;
                const newC = c + dc;
                if (isPlayableSquare(newR, newC) && boardState[newR][newC] === null) {
                    moves.push({ r: newR, c: newC, type: 'move' });
                }
                const jumpedR = newR;
                const jumpedC = newC;
                const jumpToR = r + (2 * dr);
                const jumpToC = c + (2 * dc);
                const jumpedPiece = boardState[jumpedR]?.[jumpedC];
                const isImmune = lastFlippedPieceCoords && jumpedR === lastFlippedPieceCoords.r && jumpedC === lastFlippedPieceCoords.c;
                if (!isImmune && isWithinBoardBounds(jumpToR, jumpToC) && boardState[jumpToR][jumpToC] === null && jumpedPiece && jumpedPiece.player !== currentPlayer) {
                    moves.push({ r: jumpToR, c: jumpToC, type: 'capture', jumped: { r: jumpedR, c: jumpedC } });
                }
            }
        }
        return moves;
    }

    function selectPiece(row, col) {
        clearSelection();
        selectedPiece = { row, col, piece: boardState[row][col] };
        const pieceElement = document.querySelector(`.square[data-row='${row}'][data-col='${col}'] .piece`);
        pieceElement.classList.add('selected');
        validMoves = getValidMoves(row, col);
        highlightValidMoves();
    }

    function clearSelection() {
        if (selectedPiece) {
            const pieceElement = document.querySelector(`.square[data-row='${selectedPiece.row}'][data-col='${selectedPiece.col}'] .piece`);
            if (pieceElement) pieceElement.classList.remove('selected');
        }
        selectedPiece = null;
        validMoves = [];
        document.querySelectorAll('.valid-move').forEach(el => el.classList.remove('valid-move'));
    }

    function highlightValidMoves() {
        for (const move of validMoves) {
            const square = document.querySelector(`.square[data-row='${move.r}'][data-col='${move.c}']`);
            if (square) square.classList.add('valid-move');
        }
    }

    function endGame(winner) {
        isGameOver = true;
        const overlay = document.createElement('div');
        overlay.id = 'game-over-overlay';
        const box = document.createElement('div');
        box.className = 'game-over-box';
        const message = document.createElement('h1');
        message.textContent = `Player ${winner} Won!!!`;
        message.classList.add(`player${winner}-color`);
        const button = document.createElement('button');
        button.textContent = 'Play Again';
        button.onclick = () => location.reload();
        box.appendChild(message);
        box.appendChild(button);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        startConfetti();
    }

    function getValidMoves(r, c) {
        const piece = boardState[r][c];
        if (!piece) return [];
        switch (piece.type) {
            case 'emperor': return getEmperorMoves(r, c);
            case 'governor': return getGovernorMoves(r, c, piece.player);
            case 'ambassador': return getAmbassadorMoves(r, c);
            default: return [];
        }
    }

    function isPlayableSquare(r, c) { return r > 0 && r < 10 && c > 0 && c < 8; }
    function isWithinBoardBounds(r, c) { return r >= 0 && r < rows && c >= 0 && c < cols; }

    function initializeBoard() {
        boardState = JSON.parse(JSON.stringify(initialLayout));
        boardElement.innerHTML = '';
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const square = document.createElement('div');
                square.dataset.row = r;
                square.dataset.col = c;
                square.classList.add('square');
                if (isPlayableSquare(r, c)) {
                    if ((r + c) % 2 === 0) square.classList.add('dark-square');
                    else square.classList.add('light-square');
                } else {
                    if ((r + c) % 2 === 0) square.classList.add('sacrifice-dark');
                    else square.classList.add('sacrifice-light');
                }
                boardElement.appendChild(square);
            }
        }
        renderPieces();
    }

    function renderPieces() {
        document.querySelectorAll('.piece').forEach(p => p.remove());
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const pieceData = boardState[r][c];
                if (pieceData) {
                    const pieceElement = document.createElement('div');
                    pieceElement.classList.add('piece', `player${pieceData.player}`, pieceData.type);
                    const square = document.querySelector(`.square[data-row='${r}'][data-col='${c}']`);
                    square.appendChild(pieceElement);
                }
            }
        }
    }

    function updateStatusDisplay() {
        statusDisplay.textContent = `Player ${currentPlayer}'s Turn`;
        statusDisplay.classList.remove('player1-color', 'player2-color');
        statusDisplay.classList.add(`player${currentPlayer}-color`);
    }

    initializeBoard();
    boardElement.addEventListener('click', handleSquareClick);
    updateStatusDisplay();
});