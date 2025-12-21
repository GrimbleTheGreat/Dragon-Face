// multiplayer.js
class MultiplayerHandler {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.peer = null;
        this.conn = null;
        this.playerNumber = null;

        this.ui = {
            multiplayerBtn: document.getElementById('multiplayer-btn'),
            networkControls: document.getElementById('network-controls'),
            playerIdSpan: document.getElementById('player-id'),
            joinIdInput: document.getElementById('join-id-input'),
            joinBtn: document.getElementById('join-btn'),
            statusDisplay: document.getElementById('status-display'),
            copyBtn: document.getElementById('copy-btn'),
            cancelBtn: document.getElementById('cancel-host-btn')
        };

        this.initListeners();
    }

    initListeners() {
        this.ui.multiplayerBtn.addEventListener('click', () => this.initPeer(true));

        this.ui.joinBtn.addEventListener('click', () => {
            const joinId = this.ui.joinIdInput.value;
            if (joinId) this.initPeer(false, joinId);
        });

        if (this.ui.copyBtn) {
            this.ui.copyBtn.addEventListener('click', () => this.handleCopyId());
        }

        // --- Cancel Button Listener ---
        if (this.ui.cancelBtn) {
            this.ui.cancelBtn.addEventListener('click', () => this.cancelSession());
        }
    }

    // --- Cancel Logic ---
    cancelSession() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        if (this.peer) {
            this.peer.destroy();
            this.peer = null;
        }

        this.playerNumber = null;

        this.ui.networkControls.style.display = 'none';
        this.ui.multiplayerBtn.style.display = 'block';
        this.ui.playerIdSpan.textContent = '';
        this.ui.joinIdInput.value = '';

        if (this.callbacks.onCancel) {
            this.callbacks.onCancel();
        }
    }

    initPeer(isHost, hostIdToConnect = null) {
        this.ui.multiplayerBtn.style.display = 'none';
        this.ui.networkControls.style.display = 'flex';
        this.ui.playerIdSpan.textContent = "Loading...";

        this.peer = new Peer();

        this.peer.on('open', (id) => {
            if (isHost) {
                this.playerNumber = 1;
                this.ui.playerIdSpan.textContent = id;
                this.callbacks.onPlayerAssigned(1);
            } else {
                this.connectToHost(hostIdToConnect);
            }
        });

        this.peer.on('connection', (connection) => {
            this.handleConnection(connection);
        });

        this.peer.on('error', (err) => {
            console.error(err);
            alert("Connection Error: " + err.type);
            this.cancelSession();
        });
    }

    connectToHost(hostId) {
        const connection = this.peer.connect(hostId);
        this.handleConnection(connection);
    }

    handleConnection(connection) {
        this.conn = connection;
        this.conn.on('open', () => {
            if (!this.playerNumber) {
                this.playerNumber = 2;
                this.callbacks.onPlayerAssigned(2);
            }
            this.ui.networkControls.style.display = 'none';
            this.conn.on('data', (data) => this.handleData(data));
        });

        this.conn.on('close', () => {
            alert("Opponent disconnected.");
            this.cancelSession();
        });
    }

    handleData(data) {
        if (data.type === 'move') this.callbacks.onMove(data.move);
        else if (data.type === 'promotion') this.callbacks.onPromotion(data.move);
        else if (data.type === 'reset') this.callbacks.onReset();
    }

    sendMove(startRow, startCol, moveData) {
        if (this.conn) this.conn.send({ type: 'move', move: { startRow, startCol, move: moveData } });
    }
    sendPromotion(row, col) {
        if (this.conn) this.conn.send({ type: 'promotion', move: { row, col } });
    }
    sendReset() {
        if (this.conn) this.conn.send({ type: 'reset' });
    }

    async handleCopyId() {
        const codeText = this.ui.playerIdSpan.innerText;
        if (!codeText) return;
        await navigator.clipboard.writeText(codeText);
    }
}
