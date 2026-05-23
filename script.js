const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const levelEl = document.getElementById('level');
const highScoreEl = document.getElementById('highScore');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const restartBtn = document.getElementById('restartBtn');

const GRID_SIZE = 20;
const TILE_COUNT = canvas.width / GRID_SIZE;

let snake = [{x: 10, y: 10}];
let food = {x: 15, y: 15};
let dx = 1;
let dy = 0;
let score = 0;
let level = 1;
let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
let gameRunning = true;
let gameLoop;
let speed = 160;
let particles = [];

highScoreEl.textContent = highScore;

// ==================== AUDIO ====================
let audioCtx = null;
let soundEnabled = true;

function initAudio() {
    if (audioCtx) return;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
        soundEnabled = false;
    }
}

function playTone(freq, duration, type = 'square', volume = 0.15, freqEnd = null) {
    if (!soundEnabled || !audioCtx) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 0.01), audioCtx.currentTime + duration);

    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

const soundEat = () => playTone(600, 0.08, 'square', 0.18, 900);
const soundGameOver = () => {
    playTone(440, 0.15, 'sawtooth', 0.18, 330);
    setTimeout(() => playTone(330, 0.2, 'sawtooth', 0.18, 220), 120);
    setTimeout(() => playTone(220, 0.35, 'sawtooth', 0.2, 110), 280);
};
const soundHighScore = () => {
    playTone(523, 0.1, 'triangle', 0.18);
    setTimeout(() => playTone(659, 0.1, 'triangle', 0.18), 90);
    setTimeout(() => playTone(784, 0.1, 'triangle', 0.18), 180);
    setTimeout(() => playTone(1047, 0.25, 'triangle', 0.2), 270);
};

// ==================== GAME FUNCTIONS ====================
function drawTile(x, y, color, glow = false) {
    ctx.fillStyle = color;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
    ctx.fillRect(x * GRID_SIZE + 1, y * GRID_SIZE + 1, GRID_SIZE - 2, GRID_SIZE - 2);
    ctx.shadowBlur = 0;
}

function drawSnake() {
    snake.forEach((segment, i) => {
        const alpha = 1 - (i / snake.length) * 0.6;
        drawTile(segment.x, segment.y, i === 0 ? '#7ee787' : `rgba(126, 231, 135, ${alpha})`, i === 0);
        if (i === 0) {
            ctx.fillStyle = '#0d1117';
            const es = 3;
            if (dx === 1) { ctx.fillRect(segment.x*20+12, segment.y*20+5, es, es); ctx.fillRect(segment.x*20+12, segment.y*20+12, es, es); }
            else if (dx === -1) { ctx.fillRect(segment.x*20+5, segment.y*20+5, es, es); ctx.fillRect(segment.x*20+5, segment.y*20+12, es, es); }
            else if (dy === -1) { ctx.fillRect(segment.x*20+5, segment.y*20+5, es, es); ctx.fillRect(segment.x*20+12, segment.y*20+5, es, es); }
            else { ctx.fillRect(segment.x*20+5, segment.y*20+12, es, es); ctx.fillRect(segment.x*20+12, segment.y*20+12, es, es); }
        }
    });
}

function drawFood() {
    const pulse = Math.sin(Date.now() / 180) * 2.5;
    ctx.shadowColor = '#f85149';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#f85149';
    const x = food.x * GRID_SIZE + GRID_SIZE / 2;
    const y = food.y * GRID_SIZE + GRID_SIZE / 2;
    ctx.beginPath();
    ctx.arc(x, y, GRID_SIZE/2 - 1 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

function drawParticles() { /* same as before */ 
    particles = particles.filter(p => p.life > 0);
    particles.forEach(p => {
        ctx.fillStyle = `rgba(126, 231, 135, ${p.life})`;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.025; p.size *= 0.975;
    });
}

function spawnParticles(x, y) {
    for (let i = 0; i < 10; i++) {
        particles.push({
            x: x * GRID_SIZE + GRID_SIZE / 2,
            y: y * GRID_SIZE + GRID_SIZE / 2,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 1,
            size: Math.random() * 5 + 2
        });
    }
}

function update() {
    if (!gameRunning) return;
    const head = {x: snake[0].x + dx, y: snake[0].y + dy};

    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT || 
        snake.some(s => s.x === head.x && s.y === head.y)) {
        gameOver();
        return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score += 10;
        scoreEl.textContent = score;

        if (score > highScore) {
            highScore = score;
            highScoreEl.textContent = highScore;
            localStorage.setItem('snakeHighScore', highScore);
            if (score > 50) soundHighScore();
        } else soundEat();

        spawnParticles(food.x, food.y);
        placeFood();

        // Level System
        level = Math.floor(score / 50) + 1;
        levelEl.textContent = level;
        speed = Math.max(60, 160 - (level - 1) * 12);
    } else {
        snake.pop();
    }
}

function placeFood() {
    do {
        food = { x: Math.floor(Math.random() * TILE_COUNT), y: Math.floor(Math.random() * TILE_COUNT) };
    } while (snake.some(s => s.x === food.x && s.y === food.y));
}

function draw() {
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#161b22';
    for (let i = 0; i <= TILE_COUNT; i++) {
        ctx.beginPath(); ctx.moveTo(i*GRID_SIZE, 0); ctx.lineTo(i*GRID_SIZE, canvas.height); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i*GRID_SIZE); ctx.lineTo(canvas.width, i*GRID_SIZE); ctx.stroke();
    }
    drawFood();
    drawSnake();
    drawParticles();
}

function gameOver() {
    gameRunning = false;
    clearInterval(gameLoop);
    soundGameOver();
    overlayTitle.textContent = 'Game Over';
    overlayTitle.style.color = '#f85149';
    overlayText.textContent = `Final Score: ${score} | Level ${level}`;
    overlay.classList.add('active');
}

function startGame() {
    initAudio();
    snake = [{x: 10, y: 10}];
    food = {x: 15, y: 15};
    dx = 1; dy = 0;
    score = 0; level = 1; speed = 160;
    particles = [];
    scoreEl.textContent = '0';
    levelEl.textContent = '1';
    gameRunning = true;
    overlay.classList.remove('active');

    if (gameLoop) clearInterval(gameLoop);
    gameLoop = setInterval(() => { update(); draw(); }, speed);
}

// Controls (Keyboard + Touch + Swipe)
document.addEventListener('keydown', e => { /* same as before, unchanged */ });

document.querySelectorAll('.d-btn').forEach(btn => {
    btn.addEventListener('touchstart', e => {
        e.preventDefault();
        initAudio();
        const dir = btn.dataset.dir;
        if (dir === 'up' && dy === 0) { dx=0; dy=-1; }
        if (dir === 'down' && dy === 0) { dx=0; dy=1; }
        if (dir === 'left' && dx === 0) { dx=-1; dy=0; }
        if (dir === 'right' && dx === 0) { dx=1; dy=0; }
    });
});

// Simple Swipe Support
let touchStartX = 0, touchStartY = 0;
canvas.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
});

canvas.addEventListener('touchend', e => {
    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    const dxTouch = touchEndX - touchStartX;
    const dyTouch = touchEndY - touchStartY;

    if (Math.abs(dxTouch) > 50 || Math.abs(dyTouch) > 50) {
        if (Math.abs(dxTouch) > Math.abs(dyTouch)) {
            if (dxTouch > 0 && dx === 0) { dx = 1; dy = 0; }
            else if (dxTouch < 0 && dx === 0) { dx = -1; dy = 0; }
        } else {
            if (dyTouch > 0 && dy === 0) { dx = 0; dy = 1; }
            else if (dyTouch < 0 && dy === 0) { dx = 0; dy = -1; }
        }
    }
});

restartBtn.addEventListener('click', startGame);

draw();
setTimeout(startGame, 600);