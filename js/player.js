import { db } from './config.js';
import { ref, set, get, push, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const BOARD_SIZE = 30;
const TEAMS = [
    { name: 'Equipo Rojo',     color: '#FF4757', grad: 'linear-gradient(135deg,#FF4757,#FF8C00)', emoji: '🔴' },
    { name: 'Equipo Azul',     color: '#4FC3F7', grad: 'linear-gradient(135deg,#4FC3F7,#1A6FCF)', emoji: '🔵' },
    { name: 'Equipo Verde',    color: '#00E676', grad: 'linear-gradient(135deg,#00E676,#00897B)', emoji: '🟢' },
    { name: 'Equipo Amarillo', color: '#FFD740', grad: 'linear-gradient(135deg,#FFD740,#E65100)', emoji: '🟡' },
];

const state = {
    roomId:    null,
    playerId:  null,
    name:      '',
    teamIndex: null,
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
    document.getElementById('p-room-badge').textContent = '🎲 Sala: ' + state.roomId;
    showScreen('p-join');

    document.getElementById('btn-join-next').addEventListener('click', handleJoin);
    document.getElementById('p-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleJoin();
    });
}

// ——— JOIN ———
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
    buildTeamScreen();
    showScreen('p-team');
}

// ——— TEAM SELECTION ———
function buildTeamScreen() {
    const grid = document.getElementById('team-grid');
    grid.innerHTML = TEAMS.map((t, i) => `
        <div class="team-card" data-ti="${i}" style="--tc:${t.color};--tg:${t.grad};">
            <div class="tc-emoji">${t.emoji}</div>
            <div class="tc-name" style="color:${t.color};">${esc(t.name)}</div>
        </div>`).join('');

    grid.querySelectorAll('.team-card').forEach(card => {
        card.addEventListener('click', () => {
            grid.querySelectorAll('.team-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            state.teamIndex = parseInt(card.dataset.ti, 10);
            document.getElementById('btn-team-join').disabled = false;
            showErr('team-error', '');
        });
    });

    document.getElementById('btn-team-join').addEventListener('click', handleTeamJoin);
}

async function handleTeamJoin() {
    if (state.teamIndex === null) {
        showErr('team-error', 'Elige un equipo primero.');
        return;
    }
    const btn = document.getElementById('btn-team-join');
    btn.disabled = true;
    btn.textContent = 'Uniéndose...';

    try {
        // Verify room exists
        const snap = await get(ref(db, `rooms/${state.roomId}`));
        if (!snap.exists()) {
            showErr('team-error', 'Sala no encontrada.');
            btn.disabled = false;
            btn.textContent = '¡Unirse al Equipo!';
            return;
        }

        // Register player
        const playerRef = push(ref(db, `rooms/${state.roomId}/players`));
        state.playerId  = playerRef.key;

        await set(playerRef, {
            name:      state.name,
            teamIndex: state.teamIndex,
            joinedAt:  Date.now()
        });

        setupWaitingScreen();
        showScreen('p-wait');
        listenToRoom();

    } catch (err) {
        showErr('team-error', 'Error de conexión: ' + err.message);
        btn.disabled = false;
        btn.textContent = '¡Unirse al Equipo!';
    }
}

// ——— WAITING / WATCHING SCREEN ———
function setupWaitingScreen() {
    const team = TEAMS[state.teamIndex];
    const el   = document.getElementById('my-team-display');
    if (el) {
        el.innerHTML = `
            <div class="my-team-badge" style="background:${team.grad};border-color:${team.color};">
                ${team.emoji} ${esc(team.name)}
            </div>
            <div style="font-size:.85rem;color:var(--text-dim);">👤 ${esc(state.name)}</div>`;
    }
}

// ——— LISTEN TO ROOM ———
function listenToRoom() {
    onValue(ref(db, `rooms/${state.roomId}`), snap => {
        if (!snap.exists()) return;
        const room  = snap.val();
        const phase = room.phase;
        const cti   = room.currentTeamIndex ?? 0;
        const myTurn = state.teamIndex === cti;

        if (phase === 'lobby') {
            showScreen('p-wait');
            updateWatchScreen(room, 'Esperando que el host inicie el juego...');
            return;
        }

        if (phase === 'finished') {
            showFinalScreen(room);
            return;
        }

        if (phase === 'idle') {
            showScreen('p-wait');
            const team = TEAMS[cti];
            updateWatchScreen(room, myTurn
                ? `✨ ¡Es el turno de tu equipo! Espera la pregunta...`
                : `Turno de ${team.emoji} ${team.name}`);
            return;
        }

        if (phase === 'question') {
            if (myTurn && room.currentQuestion) {
                showScreen('p-question');
                const hdr = document.getElementById('p-team-hdr');
                if (hdr) hdr.textContent = TEAMS[state.teamIndex]?.emoji || '';
                renderQuestion(room.currentQuestion);
            } else {
                showScreen('p-wait');
                const team = TEAMS[cti];
                updateWatchScreen(room, `${team.emoji} ${team.name} está respondiendo...`);
            }
            return;
        }

        if (phase === 'dice-ready') {
            showScreen('p-wait');
            if (myTurn) {
                showDiceRollUI(room);
            } else {
                const team = TEAMS[cti];
                updateWatchScreen(room, `🎲 ${team.emoji} ${team.name} va a lanzar el dado…`);
            }
            return;
        }

        if (phase === 'dice') {
            showScreen('p-wait');
            const team  = TEAMS[cti];
            const faces = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
            const dice  = room.diceResult || 0;
            const pos   = room.teams?.[cti]?.position ?? 0;
            updateWatchScreen(room,
                myTurn
                    ? `🎲 Tu equipo sacó ${faces[dice]} ${dice} — ¡Casilla ${pos}!`
                    : `🎲 ${team.emoji} ${team.name} sacó ${faces[dice]} ${dice} — Casilla ${pos}`
            );
            return;
        }

        if (phase === 'wrong') {
            showScreen('p-wait');
            const team = TEAMS[cti];
            updateWatchScreen(room,
                myTurn
                    ? `❌ Esta vez no avanzamos. ¡Suerte en el próximo turno!`
                    : `❌ ${team.emoji} ${team.name} no avanzó`
            );
            return;
        }
    });
}

function updateWatchScreen(room, statusMsg) {
    const statusEl = document.getElementById('watch-status');
    if (statusEl) statusEl.textContent = statusMsg;
    // Limpiar UI del dado si estamos en otra fase
    const diceUiEl = document.getElementById('dice-ui');
    if (diceUiEl) diceUiEl.innerHTML = '';
    renderMiniBoard(room);
}

function showDiceRollUI(room) {
    const cti  = room.currentTeamIndex ?? 0;
    const team = TEAMS[cti];

    const statusEl = document.getElementById('watch-status');
    if (statusEl) statusEl.textContent = `✅ ¡${team.name} respondió bien!`;

    const diceUiEl = document.getElementById('dice-ui');
    if (diceUiEl) {
        diceUiEl.innerHTML = `
            <div class="dice-roll-box">
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

    // Animación del dado girando
    await new Promise(resolve => {
        let count = 0;
        if (diceEl) diceEl.classList.add('dice-rolling');
        const interval = setInterval(() => {
            if (diceEl) diceEl.textContent = faces[Math.floor(Math.random() * 6)];
            count++;
            if (count >= 14) {
                clearInterval(interval);
                if (diceEl) diceEl.classList.remove('dice-rolling');
                resolve();
            }
        }, 100);
    });

    // Número final del dado
    const dice = Math.floor(Math.random() * 6) + 1;
    if (diceEl) diceEl.textContent = faces[dice - 1];

    // Pequeña pausa para que vean el resultado
    await new Promise(r => setTimeout(r, 500));

    try {
        const snap = await get(ref(db, `rooms/${state.roomId}`));
        if (!snap.exists()) { state.rolling = false; return; }
        const roomData = snap.val();
        const ti = roomData.currentTeamIndex ?? 0;

        // Verificar que aún es fase dice-ready y nuestro turno
        if (roomData.phase !== 'dice-ready' || ti !== state.teamIndex) {
            state.rolling = false;
            return;
        }

        const curPos = roomData.teams?.[ti]?.position ?? 0;
        const newPos = Math.min(curPos + dice, BOARD_SIZE);
        const won    = newPos >= BOARD_SIZE;

        await update(ref(db, `rooms/${state.roomId}`), {
            phase:                    won ? 'finished' : 'dice',
            diceResult:               dice,
            [`teams/${ti}/position`]: newPos
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
    const teams = room.teams || {};

    const posMap = {};
    Object.entries(teams).forEach(([ti, t]) => {
        const pos = t.position || 0;
        (posMap[pos] = posMap[pos] || []).push({ti:+ti,...t});
    });

    const standings = Object.entries(teams)
        .map(([i,t]) => ({i:+i,...t}))
        .sort((a,b) => (b.position||0) - (a.position||0));

    container.innerHTML = `
        <div class="mini-standings">
            ${standings.map((t, r) => {
                const isMe = t.i === state.teamIndex;
                return `
                <div class="mini-st-row${isMe ? ' mini-me' : ''}" style="border-color:${isMe ? t.color : 'transparent'}">
                    <span>${['🥇','🥈','🥉','4.'][r] || `${r+1}.`}</span>
                    <span>${t.emoji}</span>
                    <span style="flex:1;color:${t.color};font-weight:${isMe?900:700};">${esc(t.name)}${isMe ? ' (tú)' : ''}</span>
                    <span>⬡ ${t.position||0}</span>
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

    // Disable all buttons
    document.querySelectorAll('#p-options .option-btn').forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct');
        if (i === idx && idx !== q.correct) btn.classList.add('wrong');
    });

    // Show feedback
    const isCorrect = idx === q.correct;
    const feedback  = document.getElementById('p-feedback');
    if (isCorrect) {
        feedback.className = 'feedback-box correct-fb';
        feedback.innerHTML = '<span>✅</span><span>¡Correcta! El host decidirá si avanzar.</span>';
    } else {
        feedback.className = 'feedback-box wrong-fb';
        feedback.innerHTML = `<span>❌</span><span>Incorrecto. Era: ${esc(q.options[q.correct])}</span>`;
    }

    // Send to Firebase
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
    const teams  = room.teams || {};
    const sorted = Object.values(teams).sort((a,b) => (b.position||0) - (a.position||0));
    const myTeam = TEAMS[state.teamIndex];
    const icons  = ['🥇','🥈','🥉','4️⃣'];

    // Find my team's rank
    const myRank = sorted.findIndex(t => t.emoji === myTeam.emoji) + 1;
    let resultEmoji = '🎉';
    if (myRank === 1) resultEmoji = '🏆';
    else if (myRank === 2) resultEmoji = '🥈';
    else if (myRank === 3) resultEmoji = '🥉';

    document.getElementById('p-final-emoji').textContent  = resultEmoji;
    document.getElementById('p-final-team').textContent   = `${myTeam.emoji} ${myTeam.name} — Casilla ${sorted.find(t=>t.emoji===myTeam.emoji)?.position || 0}`;
    document.getElementById('p-final-team').style.color   = myTeam.color;

    const board = document.getElementById('p-final-board');
    if (board) {
        board.innerHTML = sorted.map((t, i) => `
            <div class="final-item${t.emoji === myTeam.emoji ? ' final-me' : ''}">
                <span class="fi-rank">${icons[i] || `${i+1}.`}</span>
                <span class="fi-emoji">${t.emoji}</span>
                <span class="fi-name" style="color:${t.color};">${esc(t.name)}</span>
                <span class="fi-score">⬡ ${t.position||0}</span>
            </div>`).join('');
    }

    showScreen('p-done');
}

init();
