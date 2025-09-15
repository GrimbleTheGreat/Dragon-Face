/*
This file contains all the game logic for Dragon Face, including the new
peer-to-peer multiplayer functionality using the PeerJS library.
*/

document.addEventListener('DOMContentLoaded', () => {
    // --- UI and Board Elements ---
    const boardElement = document.getElementById('game-board');
    const statusDisplay = document.getElementById('status-display');
    const playerIdSpan = document.getElementById('player-id');
    const joinIdInput = document.getElementById('join-id-input');
    const joinBtn = document.getElementById('join-btn');
    const networkControls = document.getElementById('network-controls');

    // --- Game State Variables ---
    let boardState = [];
    let currentPlayer = 1;
    let selectedPiece = null;
    let validMoves = [];
    let isGameOver = false;
    let lastFlippedPieceCoords = null;

    // --- PeerJS Networking State ---
    let peer;
    let conn;
    let playerNumber; // Will be 1 (host) or 2 (joiner)
    let myPeerId;

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

    // --- Peer-to-Peer Networking Setup ---

    // This block initializes the connection to the PeerJS signaling server.
    function initializePeer() {
        peer = new Peer(); // Create a new peer object

        // This event fires when the peer has successfully connected and received an ID.
        peer.on('open', (id) => {
            myPeerId = id;
            playerIdSpan.textContent = id;
        });

        // This event fires when another peer tries to connect to you.
        peer.on('connection', (connection) => {
            conn = connection;
            playerNumber = 1; // You are the host, Player 1
            startGame();
        });
    }

    // This block handles the logic for the "Join Game" button.
    joinBtn.addEventListener('click', () => {
        const joinId = joinIdInput.value;
        if (joinId) {
            conn = peer.connect(joinId);
            // This event fires when the connection is successfully established.
            conn.on('open', () => {
                playerNumber = 2; // You are the joiner, Player 2
                startGame();
            });
        }
    });

    // This block sets up the game once a connection is made.
    function startGame() {
        networkControls.style.display = 'none'; // Hide the connection UI
        if (conn) {
            // This is the most important listener. It handles all data from the other player.
            conn.on('data', (data) => {
                if (data.type === 'move') {
                    movePiece(data.move.startRow, data.move.startCol, data.move.move);
                }
            });
        }
        initializeBoard();
        updateStatusDisplay();
    }

    // --- Core Game Functions ---

    // This function has been modified to only allow the current player to move
    // and to send the move to the other player.
    function handleSquareClick(event) {
        if (isGameOver || !playerNumber) return; // Can't play if game is over or not connected

        // Check if it's your turn
        if (currentPlayer !== playerNumber) {
            return;
        }

        const square = event.target.closest('.square');
        if (!square) return;

        const row = parseInt(square.dataset.row);
        const col = parseInt(square.dataset.col);

        if (selectedPiece) {
            const move = validMoves.find(m => m.r === row && m.c === col);
            if (move) {
                // Send the move to the other player
                if (conn) {
                    conn.send({
                        type: 'move',
                        move: { startRow: selectedPiece.row, startCol: selectedPiece.col, move: move }
                    });
                }
                // Execute the move locally
                movePiece(selectedPiece.row, selectedPiece.col, move);
            }
            clearSelection();
        } else {
            const pieceData = boardState[row][col];
            if (pieceData && pieceData.player === currentPlayer && !pieceData.isTrapped) {
                selectPiece(row, col);
            }
        }
    }

    // The rest of the game logic is largely the same, as it just updates the local board state.
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

        checkForGovernorPromotion(move.r, pieceToMove);
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        lastFlippedPieceCoords = capturedCoords;
        renderPieces();
        updateStatusDisplay();
    }

    // --- (All other game logic functions: getGovernorMoves, getAmbassadorMoves, etc., are unchanged) ---
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
                } else { break; }
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
    function selectPiece(row, col) { clearSelection(); selectedPiece = { row, col, piece: boardState[row][col] }; const pieceElement = document.querySelector(`.square[data-row='${row}'][data-col='${col}'] .piece`); pieceElement.classList.add('selected'); validMoves = getValidMoves(row, col); highlightValidMoves(); }
    function clearSelection() { if (selectedPiece) { const pieceElement = document.querySelector(`.square[data-row='${selectedPiece.row}'][data-col='${selectedPiece.col}'] .piece`); if (pieceElement) pieceElement.classList.remove('selected'); } selectedPiece = null; validMoves = []; document.querySelectorAll('.valid-move').forEach(el => el.classList.remove('valid-move')); }
    function highlightValidMoves() { for (const move of validMoves) { const square = document.querySelector(`.square[data-row='${move.r}'][data-col='${move.c}']`); if (square) square.classList.add('valid-move'); } }
    function endGame(winner) { isGameOver = true; const overlay = document.createElement('div'); overlay.id = 'game-over-overlay'; const box = document.createElement('div'); box.className = 'game-over-box'; const message = document.createElement('h1'); message.textContent = `Player ${winner} Won!!!`; message.classList.add(`player${winner}-color`); const button = document.createElement('button'); button.textContent = 'Play Again'; button.onclick = () => location.reload(); box.appendChild(message); box.appendChild(button); overlay.appendChild(box); document.body.appendChild(overlay); startConfetti(); }
    function getValidMoves(r, c) { const piece = boardState[r][c]; if (!piece) return []; switch (piece.type) { case 'emperor': return getEmperorMoves(r, c); case 'governor': return getGovernorMoves(r, c, piece.player); case 'ambassador': return getAmbassadorMoves(r, c); default: return []; } }
    function checkForGovernorPromotion(endRow, movedPiece) { if (movedPiece.type !== 'governor') return; const promotionRow = movedPiece.player === 1 ? 1 : 9; if (endRow === promotionRow) { for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { const piece = boardState[r][c]; if (piece && piece.player === movedPiece.player && piece.type === 'ambassador' && piece.isTrapped) { piece.isTrapped = false; } } } } }
    function isPlayableSquare(r, c) { return r > 0 && r < 10 && c > 0 && c < 8; }
    function isWithinBoardBounds(r, c) { return r >= 0 && r < rows && c >= 0 && c < cols; }
    function initializeBoard() { boardState = JSON.parse(JSON.stringify(initialLayout)); boardElement.innerHTML = ''; for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { const square = document.createElement('div'); square.dataset.row = r; square.dataset.col = c; square.classList.add('square'); if (isPlayableSquare(r, c)) { if ((r + c) % 2 === 0) square.classList.add('dark-square'); else square.classList.add('light-square'); } else { if ((r + c) % 2 === 0) square.classList.add('sacrifice-dark'); else square.classList.add('sacrifice-light'); } boardElement.appendChild(square); } } renderPieces(); }
    function renderPieces() { document.querySelectorAll('.piece').forEach(p => p.remove()); for (let r = 0; r < rows; r++) { for (let c = 0; c < cols; c++) { const pieceData = boardState[r][c]; if (pieceData) { const pieceElement = document.createElement('div'); pieceElement.classList.add('piece', `player${pieceData.player}`, pieceData.type); const square = document.querySelector(`.square[data-row='${r}'][data-col='${c}']`); square.appendChild(pieceElement); } } } }
    function updateStatusDisplay() { if (!playerNumber) return; statusDisplay.textContent = `Player ${currentPlayer}'s Turn`; statusDisplay.classList.remove('player1-color', 'player2-color'); statusDisplay.classList.add(`player${currentPlayer}-color`); }

    // --- Game Start ---
    boardElement.addEventListener('click', handleSquareClick);
    initializePeer(); // This now starts the connection process.
});