import { db } from './config.js';
import { ALL_QUESTIONS } from './questions.js';
import { ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let roomId    = null;
let allQ      = [];
let usedQ     = new Set();
let roomState = {};

const esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function genId() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:6}, () => c[~~(Math.random()*c.length)]).join('');
}

function getSortedPlayers(roomData) {
    const players = roomData.players || {};
    return Object.entries(players)
        .map(([id, p]) => ({id, ...p}))
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
}

// ——— INIT ———
async function initHost() {
    roomId = genId();

    let pool = [...ALL_QUESTIONS];
    try {
        const snap = await get(ref(db, 'question-bank'));
        if (snap.exists()) {
            const custom = Object.values(snap.val());
            if (custom.length >= 5) pool = custom;
        }
    } catch(_) {}
    allQ = pool.sort(() => Math.random() - .5);

    await set(ref(db, `rooms/${roomId}`), {
        phase: 'lobby',
        currentTurnIndex: 0,
        currentPlayerId:  null,
        currentQuestion:  null,
        diceResult:       null,
        turnResult:       null,
        started:          false,
        createdAt:        Date.now()
    });

    const loc       = window.location;
    const base      = loc.origin + loc.pathname.slice(0, loc.pathname.lastIndexOf('/') + 1);
    const playerUrl = base + 'player.html?room=' + roomId;

    document.getElementById('room-code-text').textContent = roomId;
    document.getElementById('join-url').textContent       = playerUrl;
    document.getElementById('room-mini').textContent      = '🏝️ ' + roomId;

    new window.QRCode(document.getElementById('qr-code'), {
        text: playerUrl, width: 200, height: 200,
        colorDark: '#1a0e00', colorLight: '#ffffff'
    });
    new window.QRCode(document.getElementById('qr-small'), {
        text: playerUrl, width: 90, height: 90,
        colorDark: '#1a0e00', colorLight: '#ffffff'
    });

    onValue(ref(db, `rooms/${roomId}`), snap => {
        if (!snap.exists()) return;
        roomState = snap.val();
        const players = getSortedPlayers(roomState);

        updateLobby(players);
        if (roomState.phase !== 'lobby') {
            renderBoard(roomState);
            updatePanel(roomState, players);
        }
        if (roomState.phase === 'finished') {
            showFinalScreen(roomState);
        }
    });

    document.getElementById('btn-start-game').addEventListener('click', startGame);
}

// ——— LOBBY ———
function updateLobby(players) {
    document.getElementById('lobby-count').textContent  = players.length;
    document.getElementById('btn-start-game').disabled = players.length < 1;

    document.getElementById('lobby-player-list').innerHTML = players.length
        ? players.map(p => {
            const av = AVATARS[p.avatarIdx ?? 0];
            return `
            <div class="lobby-p-item" style="border-color:${av.color}33;background:${av.color}11;">
                <span class="lpi-emoji">${av.emoji}</span>
                <div class="lpi-info">
                    <span class="lpi-name" style="color:${av.color};">${esc(p.name)}</span>
                    <span class="lpi-av">${esc(av.name)}</span>
                </div>
            </div>`;
        }).join('')
        : '<div style="color:var(--text-dim);font-size:.85rem;padding:.5rem 0;text-align:center;">Esperando jugadores… 🌵</div>';
}

async function startGame() {
    document.getElementById('btn-start-game').disabled = true;

    const snap   = await get(ref(db, `rooms/${roomId}`));
    const sorted = getSortedPlayers(snap.val());
    const firstId = sorted[0]?.id || null;

    await update(ref(db, `rooms/${roomId}`), {
        phase: 'idle', started: true,
        currentTurnIndex: 0, currentPlayerId: firstId
    });

    document.getElementById('host-lobby').classList.remove('active');
    document.getElementById('host-game').classList.add('active');
}

// ——— QUESTION POOL ———
function getNextQ() {
    for (let i = 0; i < allQ.length; i++) {
        if (!usedQ.has(i)) { usedQ.add(i); return allQ[i]; }
    }
    usedQ.clear(); usedQ.add(0); return allQ[0];
}

// ——— GAME ACTIONS ———
window._ask = async function() {
    const q = getNextQ();
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'question', currentQuestion: q,
        diceResult: null, turnResult: null, turnAnswers: null
    });
};

window._correct = async function() {
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'dice-ready', currentQuestion: null,
        diceResult: null, turnResult: 'correct'
    });
};

window._hostRoll = async function() {
    const pid    = roomState.currentPlayerId;
    const dice   = ~~(Math.random() * 6) + 1;
    const curPos = roomState.players?.[pid]?.position ?? 0;
    const newPos = Math.min(curPos + dice, BOARD_SIZE);
    const won    = newPos >= BOARD_SIZE;

    await update(ref(db, `rooms/${roomId}`), {
        phase: won ? 'finished' : 'dice',
        diceResult: dice, turnResult: 'correct',
        [`players/${pid}/position`]: newPos
    });
};

window._wrong = async function() {
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'wrong', currentQuestion: null,
        diceResult: null, turnResult: 'wrong'
    });
};

window._next = async function() {
    const sorted  = getSortedPlayers(roomState);
    const curIdx  = roomState.currentTurnIndex ?? 0;
    const nextIdx = (curIdx + 1) % sorted.length;
    const nextId  = sorted[nextIdx]?.id || null;

    await update(ref(db, `rooms/${roomId}`), {
        phase: 'idle', currentTurnIndex: nextIdx, currentPlayerId: nextId,
        currentQuestion: null, diceResult: null, turnResult: null, turnAnswers: null
    });
};

window._end = async function() {
    await update(ref(db, `rooms/${roomId}`), { phase: 'finished', currentQuestion: null });
};

// ——— BOARD RENDERING ———
function renderBoard(roomData) {
    const container = document.getElementById('game-board');
    if (!container) return;
    const players = roomData.players || {};

    const posMap = {};
    const startList = [];
    Object.entries(players).forEach(([id, p]) => {
        const pos = p.position || 0;
        const av  = AVATARS[p.avatarIdx ?? 0];
        if (pos > 0) {
            (posMap[pos] = posMap[pos] || []).push({id, ...p, av});
        } else {
            startList.push({id, ...p, av});
        }
    });

    const startEl = document.getElementById('start-tokens');
    if (startEl) {
        startEl.innerHTML = startList.map(p =>
            `<div class="b-token" style="background:${esc(p.av.grad)};box-shadow:0 0 8px ${esc(p.av.color)}90;" title="${esc(p.name)}">${p.av.emoji}</div>`
        ).join('');
    }

    // Snake: top row left→right (21-30), mid row right→left (20-11), bot row left→right (1-10)
    const rows = [
        Array.from({length:10}, (_,i) => 21+i),
        Array.from({length:10}, (_,i) => 20-i),
        Array.from({length:10}, (_,i) => 1+i),
    ];

    const curPid = roomData.currentPlayerId;

    container.innerHTML = rows.map(row => `
        <div class="board-row">
        ${row.map(sq => {
            const tokens = posMap[sq] || [];
            const isGoal = sq === BOARD_SIZE;
            const isMile = sq % 5 === 0 && !isGoal;
            const isHigh = tokens.some(p => p.id === curPid);
            let cls = 'board-sq';
            if (isGoal) cls += ' sq-goal';
            else if (isMile) cls += ' sq-mile';
            if (isHigh) cls += ' sq-hl';
            return `
            <div class="${cls}">
                <div class="sq-num">${isGoal ? '🏝️' : sq}</div>
                <div class="sq-tokens">
                ${tokens.map(p =>
                    `<div class="b-token" style="background:${esc(p.av.grad)};box-shadow:0 0 6px ${esc(p.av.color)};" title="${esc(p.name)}">${p.av.emoji}</div>`
                ).join('')}
                </div>
            </div>`;
        }).join('')}
        </div>`
    ).join('');
}

// ——— SIDE PANEL ———
function updatePanel(roomData, players) {
    const pid   = roomData.currentPlayerId;
    const phase = roomData.phase;
    const curP  = players.find(p => p.id === pid) || players[0];
    const av    = AVATARS[curP?.avatarIdx ?? 0];

    const ctEl = document.getElementById('current-team-display');
    if (ctEl) {
        const pos = roomData.players?.[pid]?.position ?? 0;
        ctEl.innerHTML = `
            <span style="font-size:2.4rem;">${av.emoji}</span>
            <div>
                <div style="font-size:.68rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">Turno actual</div>
                <div style="font-weight:900;font-size:1.05rem;color:${av.color};">${esc(curP?.name || '?')}</div>
                <div style="font-size:.72rem;color:var(--text-dim);">Casilla ${pos} / ${BOARD_SIZE}</div>
            </div>`;
    }

    const ctrl = document.getElementById('panel-controls');
    if (!ctrl) return;
    const letters = ['A','B','C','D'];

    if (phase === 'idle') {
        ctrl.innerHTML = `
            <button onclick="window._ask()" class="btn-primary" style="width:100%;font-size:1rem;padding:.8rem;">
                ❓ Mostrar Pregunta
            </button>
            <button onclick="window._end()" class="btn-secondary btn-sm" style="margin-top:.5rem;width:100%;">
                🏁 Terminar Juego
            </button>`;

    } else if (phase === 'question') {
        const q = roomData.currentQuestion;
        const answers = roomData.turnAnswers
            ? Object.entries(roomData.turnAnswers).filter(([id]) => id === pid)
            : [];
        const ansHtml = answers.map(([,a]) => `
            <div class="ans-row">
                ${esc(av.emoji)} ${esc(curP?.name)}: <strong>${letters[a.answerIdx] ?? '?'}</strong>
                ${a.answerIdx === q?.correct
                    ? '<span style="color:var(--success)">✓</span>'
                    : '<span style="color:var(--danger)">✗</span>'}
            </div>`).join('');

        ctrl.innerHTML = `
            ${q ? `<div class="host-q-card">
                <div class="hq-cat">${esc(q.category || '')}</div>
                <div class="hq-text">${esc(q.question)}</div>
                <div class="hq-opts">
                ${(q.options||[]).map((o,i) => `
                    <div class="hq-opt${i===q.correct?' hqo-ok':''}">
                        <span class="opt-letter">${letters[i]}</span>${esc(o)}
                    </div>`).join('')}
                </div>
                ${ansHtml ? `<div class="ans-list"><div class="ans-title">Respuesta:</div>${ansHtml}</div>` : ''}
            </div>` : ''}
            <div style="display:flex;gap:.5rem;margin-top:.5rem;">
                <button onclick="window._correct()" class="btn-primary" style="flex:1;background:linear-gradient(135deg,#4ADE80,#16A34A);color:#000;font-weight:900;">✓ Correcto</button>
                <button onclick="window._wrong()" class="btn-secondary btn-sm" style="flex:1;color:var(--danger);border-color:var(--danger);">✗ Incorrecto</button>
            </div>`;

    } else if (phase === 'dice-ready') {
        ctrl.innerHTML = `
            <div style="text-align:center;padding:1rem;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.3);border-radius:12px;margin-bottom:.5rem;">
                <div style="font-size:2.5rem;margin-bottom:.4rem;">🎲</div>
                <div style="font-weight:900;color:#FBBF24;">✅ ${esc(av.emoji)} ${esc(curP?.name)} respondió bien!</div>
                <div style="font-size:.8rem;color:var(--text-dim);margin-top:.3rem;">Esperando que lance el dado en su celular…</div>
            </div>
            <button onclick="window._hostRoll()" class="btn-secondary btn-sm" style="width:100%;">
                🎲 Lanzar dado por el jugador
            </button>`;

    } else if (phase === 'dice') {
        const pos  = roomData.players?.[pid]?.position ?? 0;
        const dice = roomData.diceResult;
        const faces = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
        ctrl.innerHTML = `
            <div class="dice-result">
                <div class="dice-face">${faces[dice] || dice}</div>
                <div class="dice-text">
                    <strong>${dice}</strong> — ${esc(av.emoji)} ${esc(curP?.name)}<br>
                    <span style="font-size:.85rem;color:var(--text-dim);">avanza a casilla <strong>${pos}</strong></span>
                </div>
            </div>
            <button onclick="window._next()" class="btn-primary" style="width:100%;margin-top:.75rem;">▶ Siguiente Turno</button>`;

    } else if (phase === 'wrong') {
        ctrl.innerHTML = `
            <div class="wrong-result">
                <div style="font-size:3rem;">❌</div>
                <div style="font-weight:700;color:var(--danger);">${esc(av.emoji)} ${esc(curP?.name)}<br>no avanza esta vez</div>
            </div>
            <button onclick="window._next()" class="btn-primary" style="width:100%;margin-top:.75rem;">▶ Siguiente Turno</button>`;
    }

    renderStandings(roomData, players);
}

function renderStandings(roomData, players) {
    const el = document.getElementById('panel-standings');
    if (!el) return;
    const sorted = [...players].sort((a,b) => (b.position||0) - (a.position||0));
    const icons  = ['🥇','🥈','🥉'];
    el.innerHTML = sorted.map((p, r) => {
        const av = AVATARS[p.avatarIdx ?? 0];
        return `
        <div class="standing-row">
            <span class="st-rank">${icons[r] || `${r+1}.`}</span>
            <span style="font-size:1.1rem;">${av.emoji}</span>
            <span style="flex:1;font-weight:700;font-size:.82rem;color:${av.color};">${esc(p.name)}</span>
            <span style="font-weight:900;font-size:.82rem;">⬡ ${p.position||0}</span>
        </div>`;
    }).join('');
}

// ——— FINAL SCREEN ———
function showFinalScreen(roomData) {
    const game = document.getElementById('host-game');
    if (!game || game.querySelector('.final-screen')) return;

    const sorted   = getSortedPlayers(roomData).sort((a,b) => (b.position||0) - (a.position||0));
    const winner   = sorted[0];
    const winnerAv = AVATARS[winner?.avatarIdx ?? 0];
    const icons    = ['🥇','🥈','🥉','4️⃣'];

    game.innerHTML = `
        <div class="final-screen">
            <div style="font-size:5rem;margin-bottom:.5rem;">🏝️</div>
            <h1 style="font-size:2.8rem;font-weight:900;margin-bottom:.4rem;">¡Llegó al Oasis!</h1>
            <div style="font-size:1.4rem;font-weight:800;color:${winnerAv.color};margin-bottom:2rem;">
                ${winnerAv.emoji} ${esc(winner?.name)} — Casilla ${winner?.position}
            </div>
            <div class="final-table">
                ${sorted.map((p,i) => {
                    const av = AVATARS[p.avatarIdx ?? 0];
                    return `
                    <div class="final-row">
                        <span style="font-size:1.5rem;min-width:2rem;">${icons[i]||`${i+1}.`}</span>
                        <span style="font-size:1.3rem;">${av.emoji}</span>
                        <span style="flex:1;font-weight:800;font-size:1.1rem;color:${av.color};">${esc(p.name)}</span>
                        <span style="font-weight:900;">Casilla ${p.position||0} / ${BOARD_SIZE}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

initHost();
