import { db } from './config.js';
import { ref, set, get, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const BOARD_SIZE = 30;

const AVATARS = [
    { emoji: '🐰', name: 'Conejo',   color: '#FF69B4', grad: 'linear-gradient(135deg,#FF69B4,#C71585)' },
    { emoji: '🐢', name: 'Tortuga',  color: '#4ADE80', grad: 'linear-gradient(135deg,#4ADE80,#16A34A)' },
    { emoji: '🦊', name: 'Zorro',    color: '#FB923C', grad: 'linear-gradient(135deg,#FB923C,#EA580C)' },
    { emoji: '🐻', name: 'Oso',      color: '#D97706', grad: 'linear-gradient(135deg,#D97706,#92400E)' },
    { emoji: '🦁', name: 'León',     color: '#FDE047', grad: 'linear-gradient(135deg,#FDE047,#F59E0B)' },
    { emoji: '🐯', name: 'Tigre',    color: '#F97316', grad: 'linear-gradient(135deg,#F97316,#DC2626)' },
    { emoji: '🐺', name: 'Lobo',     color: '#94A3B8', grad: 'linear-gradient(135deg,#94A3B8,#475569)' },
    { emoji: '🐨', name: 'Koala',    color: '#93C5FD', grad: 'linear-gradient(135deg,#93C5FD,#3B82F6)' },
    { emoji: '🦔', name: 'Erizo',    color: '#C084FC', grad: 'linear-gradient(135deg,#C084FC,#9333EA)' },
    { emoji: '🦌', name: 'Ciervo',   color: '#A78BFA', grad: 'linear-gradient(135deg,#A78BFA,#7C3AED)' },
    { emoji: '🐿️', name: 'Ardilla',  color: '#F87171', grad: 'linear-gradient(135deg,#F87171,#B91C1C)' },
    { emoji: '🦝', name: 'Mapache',  color: '#6EE7B7', grad: 'linear-gradient(135deg,#6EE7B7,#059669)' },
];

const state = {
    roomId:    null,
    playerId:  null,
    name:      '',
    avatarIdx: null,
    answered:  false,
    rolling:   false,
};

const esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function showScreen(id) {
    document.querySelectorAll('.p-screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function showErr(id, msg) {
    const el = document.getElementById(id);
    if (el) el.textContent = msg;
}

// ——— INIT ———
function init() {
    const params = new URLSearchParams(window.location.search);
    const room   = params.get('room');

    if (!room) {
        showErr('join-error', 'Sala no encontrada. Escanea el QR nuevamente.');
        showScreen('p-join');
        return;
    }

    state.roomId = room.toUpperCase();
    document.getElementById('p-room-badge').textContent = '🏝️ Sala: ' + state.roomId;
    showScreen('p-join');

    document.getElementById('btn-join-next').addEventListener('click', handleJoin);
    document.getElementById('p-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleJoin();
    });
}

// ——— JOIN (nombre) ———
function handleJoin() {
    const nameEl = document.getElementById('p-name');
    const name   = nameEl.value.trim();
    if (!name) {
        showErr('join-error', 'Por favor escribe tu nombre.');
        nameEl.focus();
        return;
    }
    state.name = name;
    showErr('join-error', '');
    buildAvatarScreen();
    showScreen('p-avatar');
}

// ——— AVATAR SELECTION ———
function buildAvatarScreen() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = AVATARS.map((av, i) => `
        <div class="avatar-card" data-idx="${i}" style="--av-color:${av.color};">
            <div class="av-emoji">${av.emoji}</div>
            <div class="av-name" style="color:${av.color};">${esc(av.name)}</div>
        </div>`).join('');

    grid.querySelectorAll('.avatar-card').forEach(card => {
        card.addEventListener('click', () => {
            grid.querySelectorAll('.avatar-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            state.avatarIdx = parseInt(card.dataset.idx, 10);
            document.getElementById('btn-avatar-join').disabled = false;
            showErr('avatar-error', '');
        });
    });

    document.getElementById('btn-avatar-join').addEventListener('click', handleAvatarJoin);
}

async function handleAvatarJoin() {
    if (state.avatarIdx === null) {
        showErr('avatar-error', 'Elige tu animal primero.');
        return;
    }
    const btn = document.getElementById('btn-avatar-join');
    btn.disabled = true;
    btn.textContent = 'Uniéndose…';

    try {
        const snap = await get(ref(db, `rooms/${state.roomId}`));
        if (!snap.exists()) {
            showErr('avatar-error', 'Sala no encontrada.');
            btn.disabled = false;
            btn.textContent = '¡Unirse! 🏝️';
            return;
        }

        const playerRef = push(ref(db, `rooms/${state.roomId}/players`));
        state.playerId  = playerRef.key;

        await set(playerRef, {
            name:      state.name,
            avatarIdx: state.avatarIdx,
            position:  0,
            joinedAt:  Date.now()
        });

        setupWaitingScreen();
        showScreen('p-wait');
        listenToRoom();

    } catch (err) {
        showErr('avatar-error', 'Error de conexión: ' + err.message);
        btn.disabled = false;
        btn.textContent = '¡Unirse! 🏝️';
    }
}

// ——— WAITING SCREEN ———
function setupWaitingScreen() {
    const av = AVATARS[state.avatarIdx];
    const el = document.getElementById('my-player-display');
    if (el) {
        el.innerHTML = `
            <div class="my-avatar-badge" style="background:${av.grad};">
                <span class="mab-emoji">${av.emoji}</span>
                <div class="mab-info">
                    <div class="mab-name">${esc(state.name)}</div>
                    <div class="mab-av">${esc(av.name)}</div>
                </div>
            </div>`;
    }
}

// ——— LISTEN TO ROOM ———
function listenToRoom() {
    onValue(ref(db, `rooms/${state.roomId}`), snap => {
        if (!snap.exists()) return;
        const room   = snap.val();
        const phase  = room.phase;
        const pid    = room.currentPlayerId;
        const myTurn = state.playerId === pid;
        const curP   = room.players?.[pid];
        const curAv  = AVATARS[curP?.avatarIdx ?? 0];

        if (phase === 'lobby') {
            showScreen('p-wait');
            updateWatchScreen(room, 'Esperando que el host inicie el juego… 🌵');
            return;
        }

        if (phase === 'finished') {
            showFinalScreen(room);
            return;
        }

        if (phase === 'idle') {
            showScreen('p-wait');
            updateWatchScreen(room, myTurn
                ? `✨ ¡Es tu turno! El host te enviará la pregunta…`
                : `Turno de ${curAv.emoji} ${esc(curP?.name || '?')}`);
            return;
        }

        if (phase === 'question') {
            if (myTurn && room.currentQuestion) {
                showScreen('p-question');
                const hdr = document.getElementById('p-team-hdr');
                if (hdr) hdr.textContent = AVATARS[state.avatarIdx]?.emoji || '';
                renderQuestion(room.currentQuestion);
            } else {
                showScreen('p-wait');
                updateWatchScreen(room, `${curAv.emoji} ${esc(curP?.name)} está respondiendo…`);
            }
            return;
        }

        if (phase === 'dice-ready') {
            showScreen('p-wait');
            if (myTurn) {
                showDiceRollUI(room);
            } else {
                updateWatchScreen(room, `🎲 ${curAv.emoji} ${esc(curP?.name)} va a lanzar el dado…`);
            }
            return;
        }

        if (phase === 'dice') {
            showScreen('p-wait');
            const faces = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
            const dice  = room.diceResult || 0;
            const pos   = room.players?.[pid]?.position ?? 0;
            updateWatchScreen(room, myTurn
                ? `🎲 Sacaste ${faces[dice]} ${dice} — ¡Estás en casilla ${pos}!`
                : `🎲 ${curAv.emoji} ${esc(curP?.name)} sacó ${faces[dice]} ${dice} — Casilla ${pos}`
            );
            return;
        }

        if (phase === 'wrong') {
            showScreen('p-wait');
            updateWatchScreen(room, myTurn
                ? `❌ Esta vez no avanzas. ¡Suerte en el próximo turno!`
                : `❌ ${curAv.emoji} ${esc(curP?.name)} no avanzó`
            );
            return;
        }
    });
}

function updateWatchScreen(room, statusMsg) {
    const statusEl = document.getElementById('watch-status');
    if (statusEl) statusEl.textContent = statusMsg;
    const diceUiEl = document.getElementById('dice-ui');
    if (diceUiEl) diceUiEl.innerHTML = '';
    renderMiniBoard(room);
}

function showDiceRollUI(room) {
    const av = AVATARS[state.avatarIdx];

    const statusEl = document.getElementById('watch-status');
    if (statusEl) statusEl.textContent = `✅ ¡Respondiste bien, ${esc(state.name)}!`;

    const diceUiEl = document.getElementById('dice-ui');
    if (diceUiEl) {
        diceUiEl.innerHTML = `
            <div class="dice-roll-box">
                <div style="font-size:.9rem;color:var(--text-dim);font-weight:700;margin-bottom:.5rem;">
                    Lanza el dado y avanza
                </div>
                <div id="dice-display" class="dice-big-face">🎲</div>
                <button id="btn-roll-dice" class="btn-roll" onclick="window._playerRoll()">
                    🎲 ¡Lanzar Dado!
                </button>
            </div>`;
    }
    renderMiniBoard(room);
}

window._playerRoll = async function() {
    if (state.rolling) return;
    state.rolling = true;

    const btn    = document.getElementById('btn-roll-dice');
    const diceEl = document.getElementById('dice-display');
    if (btn) btn.disabled = true;

    const faces = ['⚀','⚁','⚂','⚃','⚄','⚅'];

    await new Promise(resolve => {
        let count = 0;
        if (diceEl) diceEl.classList.add('dice-rolling');
        const interval = setInterval(() => {
            if (diceEl) diceEl.textContent = faces[Math.floor(Math.random() * 6)];
            count++;
            if (count >= 16) {
                clearInterval(interval);
                if (diceEl) diceEl.classList.remove('dice-rolling');
                resolve();
            }
        }, 90);
    });

    const dice = Math.floor(Math.random() * 6) + 1;
    if (diceEl) diceEl.textContent = faces[dice - 1];

    await new Promise(r => setTimeout(r, 600));

    try {
        const snap = await get(ref(db, `rooms/${state.roomId}`));
        if (!snap.exists()) { state.rolling = false; return; }
        const roomData = snap.val();

        if (roomData.phase !== 'dice-ready' || roomData.currentPlayerId !== state.playerId) {
            state.rolling = false;
            return;
        }

        const curPos = roomData.players?.[state.playerId]?.position ?? 0;
        const newPos = Math.min(curPos + dice, BOARD_SIZE);
        const won    = newPos >= BOARD_SIZE;

        await update(ref(db, `rooms/${state.roomId}`), {
            phase:                          won ? 'finished' : 'dice',
            diceResult:                     dice,
            [`players/${state.playerId}/position`]: newPos
        });
    } catch(err) {
        console.error('Error al lanzar dado:', err);
    }

    state.rolling = false;
};

// ——— MINI BOARD ———
function renderMiniBoard(room) {
    const container = document.getElementById('mini-board');
    if (!container) return;
    const players = room.players || {};

    const sorted = Object.entries(players)
        .map(([id, p]) => ({id, ...p}))
        .sort((a, b) => (b.position||0) - (a.position||0));

    const icons = ['🥇','🥈','🥉'];

    container.innerHTML = `
        <div class="mini-standings">
            <div class="mini-title">🏝️ Camino al Oasis</div>
            ${sorted.map((p, r) => {
                const av   = AVATARS[p.avatarIdx ?? 0];
                const isMe = p.id === state.playerId;
                const pct  = Math.round((p.position||0) / BOARD_SIZE * 100);
                return `
                <div class="mini-st-row${isMe ? ' mini-me' : ''}" style="${isMe ? `border-color:${av.color};` : ''}">
                    <span class="ms-rank">${icons[r] || `${r+1}.`}</span>
                    <span class="ms-emoji">${av.emoji}</span>
                    <div class="ms-info">
                        <div class="ms-name" style="color:${av.color};">${esc(p.name)}${isMe ? ' ✦' : ''}</div>
                        <div class="ms-bar-wrap">
                            <div class="ms-bar" style="width:${pct}%;background:${av.color};"></div>
                        </div>
                    </div>
                    <span class="ms-pos">⬡ ${p.position||0}</span>
                </div>`;
            }).join('')}
        </div>`;
}

// ——— QUESTION SCREEN ———
function renderQuestion(q) {
    state.answered = false;
    document.getElementById('p-q-category').textContent = q.category || '';
    document.getElementById('p-q-text').textContent     = q.question || '';

    const feedback = document.getElementById('p-feedback');
    feedback.className = 'feedback-box hidden';
    feedback.innerHTML = '';

    const letters = ['A','B','C','D'];
    const opts    = document.getElementById('p-options');
    opts.innerHTML = (q.options || []).map((o, i) => `
        <button class="option-btn" data-idx="${i}">
            <span class="opt-letter">${letters[i]}</span>
            ${esc(o)}
        </button>`).join('');

    opts.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!state.answered) handleAnswer(parseInt(btn.dataset.idx, 10), q);
        });
    });
}

async function handleAnswer(idx, q) {
    if (state.answered) return;
    state.answered = true;

    document.querySelectorAll('#p-options .option-btn').forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct');
        if (i === idx && idx !== q.correct) btn.classList.add('wrong');
    });

    const isCorrect = idx === q.correct;
    const feedback  = document.getElementById('p-feedback');
    if (isCorrect) {
        feedback.className = 'feedback-box correct-fb';
        feedback.innerHTML = '<span>✅</span><span>¡Correcto! Prepárate para lanzar el dado…</span>';
    } else {
        feedback.className = 'feedback-box wrong-fb';
        feedback.innerHTML = `<span>❌</span><span>Incorrecto. Era: ${esc(q.options[q.correct])}</span>`;
    }

    try {
        if (state.playerId && state.roomId) {
            await set(
                ref(db, `rooms/${state.roomId}/turnAnswers/${state.playerId}`),
                { answerIdx: idx, isCorrect, timestamp: Date.now() }
            );
        }
    } catch(_) {}
}

// ——— FINAL SCREEN ———
function showFinalScreen(room) {
    const players = room.players || {};
    const sorted  = Object.entries(players)
        .map(([id, p]) => ({id, ...p}))
        .sort((a, b) => (b.position||0) - (a.position||0));

    const myData = players[state.playerId];
    const myAv   = AVATARS[state.avatarIdx ?? 0];
    const myRank = sorted.findIndex(p => p.id === state.playerId) + 1;
    const icons  = ['🥇','🥈','🥉','4️⃣'];

    let resultEmoji = '🎉';
    if (myRank === 1) resultEmoji = '🏝️';
    else if (myRank === 2) resultEmoji = '🥈';
    else if (myRank === 3) resultEmoji = '🥉';

    document.getElementById('p-final-emoji').textContent = resultEmoji;
    document.getElementById('p-final-team').textContent  =
        `${myAv.emoji} ${state.name} — Casilla ${myData?.position || 0} / ${BOARD_SIZE}`;
    document.getElementById('p-final-team').style.color = myAv.color;

    const board = document.getElementById('p-final-board');
    if (board) {
        board.innerHTML = `
            <div class="mini-standings">
            ${sorted.map((p, i) => {
                const av   = AVATARS[p.avatarIdx ?? 0];
                const isMe = p.id === state.playerId;
                return `
                <div class="final-item${isMe ? ' final-me' : ''}">
                    <span class="fi-rank">${icons[i] || `${i+1}.`}</span>
                    <span class="fi-emoji">${av.emoji}</span>
                    <span class="fi-name" style="color:${av.color};">${esc(p.name)}</span>
                    <span class="fi-score">⬡ ${p.position||0}</span>
                </div>`;
            }).join('')}
            </div>`;
    }

    showScreen('p-done');
}

init();
