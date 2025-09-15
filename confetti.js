/* This file contains a simple confetti animation function for the win screen. */

const canvas = document.getElementById('confetti-canvas');
const ctx = canvas.getContext('2d');
let confettiPieces = [];
let animationFrameId;

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function startConfetti() {
    resizeCanvas();
    confettiPieces = [];
    for (let i = 0; i < 200; i++) {
        confettiPieces.push(createConfettiPiece());
    }
    animateConfetti();
}

function createConfettiPiece() {
    const colors = ['#E74C3C', '#3498DB', '#F1C40F', '#2ECC71', '#9B59B6', '#FFFFFF'];
    return {
        x: Math.random() * canvas.width,
        y: -20,
        w: 10 + Math.random() * 10,
        h: 10 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        speed: 2 + Math.random() * 3,
        tilt: Math.random() * Math.PI,
        tiltSpeed: 0.1 * (Math.random() - 0.5)
    };
}

function drawConfetti() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    confettiPieces.forEach(piece => {
        ctx.save();
        ctx.fillStyle = piece.color;
        ctx.translate(piece.x + piece.w / 2, piece.y + piece.h / 2);
        ctx.rotate(piece.tilt);
        ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
        ctx.restore();
    });
}

function updateConfetti() {
    confettiPieces.forEach(piece => {
        piece.y += piece.speed;
        piece.tilt += piece.tiltSpeed;
        if (piece.y > canvas.height) {
            // Reset piece when it goes off screen
            piece.x = Math.random() * canvas.width;
            piece.y = -20;
        }
    });
}

function animateConfetti() {
    updateConfetti();
    drawConfetti();
    animationFrameId = requestAnimationFrame(animateConfetti);
}

window.addEventListener('resize', resizeCanvas);