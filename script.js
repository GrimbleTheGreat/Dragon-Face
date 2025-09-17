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
                    // Note: In a more complex game, you'd want validation here.
                    movePiece(data.move.startRow, data.move.startCol, data.move.move);
                } else if (data.type === 'promotion') {
                    performPromotion(data.move.row, data.move.col);
                } else if (data.type === 'reset') {
                    resetGame(true); // Reset the game when the peer requests it
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
    let promotionState = null; // NEW: Holds state for governor promotion/rescue

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
        // Prevent interaction if it's an online game and not your turn
        if (playerNumber && currentPlayer !== playerNumber) return;
        if (isGameOver) return;

        const square = event.target.closest('.square');
        if (!square) return;

        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);

        // If we are in a promotion/rescue state, handle that separately
        if (promotionState) {
            handlePromotionClick(row, col);
            return;
        }

        if (selectedPiece) {
            // Attempt to move the selected piece
            const move = validMoves.find(m => m.r === row && m.c === col);
            if (move) {
                if (conn) { // Send move data if online
                    conn.send({ type: 'move', move: { startRow: selectedPiece.row, startCol: selectedPiece.col, move: move } });
                }
                movePiece(selectedPiece.row, selectedPiece.col, move);
            }

            // If the move did NOT result in a promotion, clear the selection.
            // Otherwise, leave the valid moves (the rescue targets) highlighted.
            if (!promotionState) {
                clearSelection();
            }

        } else {
            // Attempt to select a piece
            const pieceData = boardState[row][col];
            if (pieceData && pieceData.player === currentPlayer && !pieceData.isTrapped) {
                selectPiece(row, col);
            }
        }
    }


    function movePiece(startRow, startCol, move) {
        const pieceToMove = boardState[startRow][startCol];
        let capturedCoords = null;

        // Handle piece capture
        if (move.type === 'capture') {
            const jumpedPiece = boardState[move.jumped.r][move.jumped.c];
            // Check for Emperor capture (win condition)
            if (jumpedPiece.type === 'emperor') {
                endGame(currentPlayer);
                return;
            }
            // Flip the captured piece's player
            jumpedPiece.player = currentPlayer;
            capturedCoords = { r: move.jumped.r, c: move.jumped.c };
        }

        // Update governor's 'hasMoved' status
        if (pieceToMove.type === 'governor' && pieceToMove.hasMoved === false) {
            pieceToMove.hasMoved = true;
        }

        // Check if the piece moved into the sacrifice zone
        if (!isPlayableSquare(move.r, move.c)) {
            pieceToMove.isTrapped = true;
        }

        // Update the board state with the new piece position
        boardState[startRow][startCol] = null;
        boardState[move.r][move.c] = pieceToMove;

        // Check if this move triggers the promotion/rescue mechanic
        const enteredPromotion = handleGovernorPromotion(move.r, move.c, pieceToMove);
        if (enteredPromotion) {
            renderPieces(); // Re-render to show the governor on the backline
            highlightValidMoves(); // Highlight potential swaps
            return; // Stop here and wait for the player to choose an ambassador
        }

        // If no promotion, proceed to the next turn as normal
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        lastFlippedPieceCoords = capturedCoords; // For immunity rule
        renderPieces();
        updateStatusDisplay();
    }


    // --- Special Game Mechanics ---

    // This handles clicks ONLY when the game is in the governor promotion/rescue state.
    function handlePromotionClick(row, col) {
        // Find all trapped ambassadors for the current player
        const trappedAmbassadors = findTrappedAmbassadors(currentPlayer);
        // Check if the clicked square is a valid ambassador to rescue
        const isClickValid = trappedAmbassadors.some(ambassador => ambassador.r === row && ambassador.c === col);

        if (isClickValid) {
            if (conn) {
                conn.send({ type: 'promotion', move: { row: row, col: col } });
            }
            performPromotion(row, col);
        }
    }

    // This function contains the logic for the ambassador/governor swap.
    function performPromotion(row, col) {
        const govCoords = promotionState.governorCoords;
        const governorPiece = boardState[govCoords.r][govCoords.c];
        const ambassadorPiece = boardState[row][col];

        // Untrap the ambassador and trap the governor
        ambassadorPiece.isTrapped = false;
        governorPiece.isTrapped = true;

        // Swap their positions on the board
        boardState[govCoords.r][govCoords.c] = ambassadorPiece;
        boardState[row][col] = governorPiece;

        // Exit the rescue state and end the "extra" turn
        clearSelection(); // This also clears the green highlights
        promotionState = null;
        currentPlayer = currentPlayer === 1 ? 2 : 1; // Now switch to the next player
        renderPieces();
        updateStatusDisplay();
    }


    // This function checks for the promotion condition and activates the rescue state.
    function handleGovernorPromotion(endRow, endCol, movedPiece) {
        if (movedPiece.type !== 'governor') return false;

        // Define the promotion row for each player
        const promotionRow = movedPiece.player === 1 ? 1 : 9;

        if (endRow === promotionRow) {
            // Check if there are any ambassadors to rescue
            const trappedAmbassadors = findTrappedAmbassadors(movedPiece.player);
            if (trappedAmbassadors.length > 0) {
                // Enter rescue mode!
                promotionState = { governorCoords: { r: endRow, c: endCol } };
                validMoves = trappedAmbassadors; // Use validMoves to store rescue targets
                statusDisplay.textContent = `Player ${movedPiece.player}, choose an Ambassador to rescue!`;
                return true; // Signal that we entered rescue mode
            }
        }
        return false; // No rescue occurred
    }

    // This helper function finds all of a player's trapped Ambassadors.
    function findTrappedAmbassadors(player) {
        const ambassadors = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const piece = boardState[r][c];
                if (piece && piece.player === player && piece.type === 'ambassador' && piece.isTrapped) {
                    ambassadors.push({ r, c }); // Add coordinates to the list
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

        // Standard 1-space forward moves (straight and diagonal)
        for (let dc = -1; dc <= 1; dc++) {
            const newR = r + forwardDir;
            const newC = c + dc;
            if (isPlayableSquare(newR, newC) && boardState[newR][newC] === null) {
                moves.push({ r: newR, c: newC, type: 'move' });
            }
        }
        // Special 2-space first move
        if (piece.hasMoved === false) {
            for (let dc = -1; dc <= 1; dc++) {
                const oneStepR = r + forwardDir;
                const oneStepC = c + dc;
                const twoStepsR = r + (2 * forwardDir);
                const twoStepsC = c + (2 * dc);
                // Can only move two steps if the path is clear
                if (isPlayableSquare(twoStepsR, twoStepsC) && boardState[oneStepR][oneStepC] === null && boardState[twoStepsR][twoStepsC] === null) {
                    moves.push({ r: twoStepsR, c: twoStepsC, type: 'move' });
                }
            }
        }
        // Capture moves (diagonal jumps only)
        for (let dc = -1; dc <= 1; dc++) {
            if (dc === 0) continue; // Governors can't capture straight ahead
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
            // Standard moves
            let newR = r + dir.r;
            let newC = c + dir.c;
            while (isPlayableSquare(newR, newC)) {
                if (boardState[newR][newC] === null) {
                    moves.push({ r: newR, c: newC, type: 'move' });
                    newR += dir.r;
                    newC += dir.c;
                } else {
                    break; // Path blocked
                }
            }
            // Capture moves (jump over the blocking piece)
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
                // Standard 1-space move
                const newR = r + dr;
                const newC = c + dc;
                if (isPlayableSquare(newR, newC) && boardState[newR][newC] === null) {
                    moves.push({ r: newR, c: newC, type: 'move' });
                }
                // Capture move (jump)
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

    // --- Selection and Highlighting ---
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

    // --- Utility and Rendering Functions ---

    function resetGame(initiatedByPeer = false) {
        // Reset all game state variables to their defaults
        boardState = JSON.parse(JSON.stringify(initialLayout));
        currentPlayer = 1;
        selectedPiece = null;
        validMoves = [];
        isGameOver = false;
        lastFlippedPieceCoords = null;
        promotionState = null;

        // Remove the game over screen
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) {
            overlay.remove();
        }

        // Stop the confetti animation
        if (typeof stopConfetti === 'function') {
            stopConfetti();
        }

        // Redraw the board and update the status
        renderPieces();
        updateStatusDisplay();

        // If this player clicked the button, tell the other player to reset too
        if (conn && !initiatedByPeer) {
            conn.send({ type: 'reset' });
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
        button.onclick = () => resetGame(false); // Call resetGame instead of reloading
        box.appendChild(message);
        box.appendChild(button);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
        startConfetti(); // From confetti.js
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
                } else { // Sacrifice zone
                    if ((r + c) % 2 === 0) square.classList.add('sacrifice-dark');
                    else square.classList.add('sacrifice-light');
                }
                boardElement.appendChild(square);
            }
        }
        renderPieces();
    }

    function renderPieces() {
        // Clear existing pieces from the board
        document.querySelectorAll('.piece').forEach(p => p.remove());
        // Draw pieces based on the current board state
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

    // --- Game Start ---
    initializeBoard();
    boardElement.addEventListener('click', handleSquareClick);
    updateStatusDisplay();
});

