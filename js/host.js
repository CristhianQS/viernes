import { db } from './config.js';
import { ALL_QUESTIONS } from './questions.js';
import { ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const BOARD_SIZE = 30;
const TEAMS = [
    { name: 'Equipo Rojo',     color: '#FF4757', grad: 'linear-gradient(135deg,#FF4757,#FF8C00)', emoji: '🔴' },
    { name: 'Equipo Azul',     color: '#4FC3F7', grad: 'linear-gradient(135deg,#4FC3F7,#1A6FCF)', emoji: '🔵' },
    { name: 'Equipo Verde',    color: '#00E676', grad: 'linear-gradient(135deg,#00E676,#00897B)', emoji: '🟢' },
    { name: 'Equipo Amarillo', color: '#FFD740', grad: 'linear-gradient(135deg,#FFD740,#E65100)', emoji: '🟡' },
];

let roomId   = null;
let allQ     = [];
let usedQ    = new Set();
let roomState = {};

const esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');

function genId() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:6}, () => c[~~(Math.random()*c.length)]).join('');
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

    const teamsData = {};
    TEAMS.forEach((t, i) => { teamsData[i] = { ...t, position: 0 }; });

    await set(ref(db, `rooms/${roomId}`), {
        phase: 'lobby',
        currentTeamIndex: 0,
        currentQuestion: null,
        diceResult: null,
        turnResult: null,
        teams: teamsData,
        started: false,
        createdAt: Date.now()
    });

    const loc  = window.location;
    const base = loc.origin + loc.pathname.slice(0, loc.pathname.lastIndexOf('/') + 1);
    const playerUrl = base + 'player.html?room=' + roomId;

    document.getElementById('room-code-text').textContent = roomId;
    document.getElementById('join-url').textContent       = playerUrl;

    new window.QRCode(document.getElementById('qr-code'), {
        text: playerUrl, width: 200, height: 200,
        colorDark: '#1a1a2e', colorLight: '#ffffff'
    });
    new window.QRCode(document.getElementById('qr-small'), {
        text: playerUrl, width: 90, height: 90,
        colorDark: '#1a1a2e', colorLight: '#ffffff'
    });
    document.getElementById('room-mini').textContent = roomId;

    onValue(ref(db, `rooms/${roomId}`), snap => {
        if (!snap.exists()) return;
        roomState = snap.val();
        const players = roomState.players
            ? Object.entries(roomState.players).map(([id,p]) => ({id,...p}))
            : [];

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
    document.getElementById('lobby-count').textContent        = players.length;
    document.getElementById('btn-start-game').disabled        = players.length < 1;

    const byTeam = {};
    players.forEach(p => {
        const ti = p.teamIndex ?? 0;
        (byTeam[ti] = byTeam[ti] || []).push(p);
    });

    document.getElementById('lobby-team-list').innerHTML = TEAMS.map((t, i) => {
        const tp = byTeam[i] || [];
        return `
            <div class="ltg" style="border-color:${t.color}">
                <div class="ltg-hdr" style="color:${t.color}">${t.emoji} ${esc(t.name)} <span class="ltg-cnt">${tp.length}</span></div>
                ${tp.map(p => `<div class="ltg-p">👤 ${esc(p.name)}</div>`).join('')}
            </div>`;
    }).join('');
}

async function startGame() {
    document.getElementById('btn-start-game').disabled = true;
    await update(ref(db, `rooms/${roomId}`), { phase: 'idle', started: true });
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

// ——— GAME ACTIONS (exposed to window for inline buttons) ———
window._ask = async function() {
    const q = getNextQ();
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'question',
        currentQuestion: q,
        diceResult: null,
        turnResult: null,
        turnAnswers: null
    });
};

window._correct = async function() {
    // El equipo respondió bien → pasan a fase dice-ready para que el jugador lance el dado
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'dice-ready',
        currentQuestion: null,
        diceResult: null,
        turnResult: 'correct'
    });
};

// Lanzar dado desde el host (fallback si ningún jugador lo hace)
window._hostRoll = async function() {
    const ti     = roomState.currentTeamIndex ?? 0;
    const dice   = ~~(Math.random() * 6) + 1;
    const curPos = roomState.teams?.[ti]?.position ?? 0;
    const newPos = Math.min(curPos + dice, BOARD_SIZE);
    const won    = newPos >= BOARD_SIZE;

    await update(ref(db, `rooms/${roomId}`), {
        phase: won ? 'finished' : 'dice',
        diceResult: dice,
        turnResult: 'correct',
        [`teams/${ti}/position`]: newPos
    });
};

window._wrong = async function() {
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'wrong',
        currentQuestion: null,
        diceResult: null,
        turnResult: 'wrong'
    });
};

window._next = async function() {
    const next = ((roomState.currentTeamIndex ?? 0) + 1) % TEAMS.length;
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'idle',
        currentTeamIndex: next,
        currentQuestion: null,
        diceResult: null,
        turnResult: null,
        turnAnswers: null
    });
};

window._end = async function() {
    await update(ref(db, `rooms/${roomId}`), { phase: 'finished', currentQuestion: null });
};

// ——— BOARD RENDERING ———
function renderBoard(roomData) {
    const container = document.getElementById('game-board');
    if (!container) return;
    const teams = roomData.teams || {};

    const posMap = {};
    const startTokens = [];
    Object.entries(teams).forEach(([ti, t]) => {
        const pos = t.position || 0;
        if (pos > 0) {
            (posMap[pos] = posMap[pos] || []).push({ti:+ti, ...t});
        } else {
            startTokens.push({ti:+ti, ...t});
        }
    });

    // Render start zone tokens
    const startEl = document.getElementById('start-tokens');
    if (startEl) {
        startEl.innerHTML = startTokens.map(t =>
            `<div class="b-token" style="background:${esc(t.grad)};box-shadow:0 0 8px ${esc(t.color)}80;" title="${esc(t.name)}">${t.emoji}</div>`
        ).join('');
    }

    // Snake board rows
    const rows = [
        Array.from({length:10}, (_,i) => 21+i),   // top:  21→30
        Array.from({length:10}, (_,i) => 20-i),   // mid:  20→11
        Array.from({length:10}, (_,i) => 1+i),    // bot:   1→10
    ];

    const activeTi  = roomData.currentTeamIndex ?? 0;
    const activePos = teams[activeTi]?.position ?? 0;

    container.innerHTML = rows.map(row => `
        <div class="board-row">
        ${row.map(sq => {
            const tokens  = posMap[sq] || [];
            const isGoal  = sq === BOARD_SIZE;
            const isMile  = sq % 5 === 0 && !isGoal;
            const isHigh  = sq === activePos && activePos > 0;
            let cls = 'board-sq';
            if (isGoal) cls += ' sq-goal';
            else if (isMile) cls += ' sq-mile';
            if (isHigh) cls += ' sq-hl';

            return `
            <div class="${cls}">
                <div class="sq-num">${isGoal ? '🏆' : sq}</div>
                <div class="sq-tokens">
                ${tokens.map(t =>
                    `<div class="b-token" style="background:${esc(t.grad)};box-shadow:0 0 6px ${esc(t.color)}90;" title="${esc(t.name)}">${t.emoji}</div>`
                ).join('')}
                </div>
            </div>`;
        }).join('')}
        </div>
    `).join('');
}

// ——— SIDE PANEL ———
function updatePanel(roomData, players) {
    const ti    = roomData.currentTeamIndex ?? 0;
    const team  = TEAMS[ti];
    const phase = roomData.phase;

    // Current team display
    const ctEl = document.getElementById('current-team-display');
    if (ctEl) {
        const pos = roomData.teams?.[ti]?.position ?? 0;
        ctEl.innerHTML = `
            <span style="font-size:2.2rem;">${team.emoji}</span>
            <div>
                <div style="font-size:.68rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;">Turno actual</div>
                <div style="font-weight:900;font-size:1.05rem;color:${team.color};">${esc(team.name)}</div>
                <div style="font-size:.72rem;color:var(--text-dim);">Casilla ${pos}</div>
            </div>`;
    }

    // Controls
    const ctrl = document.getElementById('panel-controls');
    if (!ctrl) return;

    if (phase === 'idle') {
        ctrl.innerHTML = `
            <button onclick="window._ask()" class="btn-primary" style="width:100%;font-size:1rem;padding:.8rem;">
                🎯 Mostrar Pregunta
            </button>
            <button onclick="window._end()" class="btn-secondary btn-sm" style="margin-top:.5rem;width:100%;">
                🏁 Terminar Juego
            </button>`;

    } else if (phase === 'question') {
        const q = roomData.currentQuestion;
        const letters = ['A','B','C','D'];

        // Player answers from current team
        const answers = roomData.turnAnswers ? Object.entries(roomData.turnAnswers) : [];
        const teamAnswers = answers
            .filter(([pid]) => {
                const p = players.find(pl => pl.id === pid);
                return p && (p.teamIndex ?? 0) === ti;
            })
            .map(([pid, a]) => {
                const p = players.find(pl => pl.id === pid);
                return { name: p?.name || '?', ...a };
            });

        const ansHtml = teamAnswers.map(a => `
            <div class="ans-row">
                👤 ${esc(a.name)}:
                <strong>${letters[a.answerIdx] ?? '?'}</strong>
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
                ${ansHtml ? `<div class="ans-list"><div class="ans-title">Respuestas recibidas:</div>${ansHtml}</div>` : ''}
            </div>` : ''}
            <div style="display:flex;gap:.5rem;margin-top:.5rem;">
                <button onclick="window._correct()" class="btn-primary" style="flex:1;background:linear-gradient(135deg,#00E676,#00897B);color:#000;font-weight:900;">✓ Correcto</button>
                <button onclick="window._wrong()" class="btn-secondary btn-sm" style="flex:1;color:var(--danger);border-color:var(--danger);">✗ Incorrecto</button>
            </div>`;

    } else if (phase === 'dice-ready') {
        ctrl.innerHTML = `
            <div style="text-align:center;padding:1rem;background:rgba(255,215,0,0.1);border-radius:10px;margin-bottom:.5rem;">
                <div style="font-size:2.5rem;margin-bottom:.4rem;">🎲</div>
                <div style="font-weight:900;color:var(--gold);font-size:1rem;">
                    ✅ ${esc(team.emoji)} ${esc(team.name)} respondió bien
                </div>
                <div style="font-size:.8rem;color:var(--text-dim);margin-top:.3rem;">
                    Esperando que el jugador lance el dado en su celular…
                </div>
            </div>
            <button onclick="window._hostRoll()" class="btn-secondary btn-sm" style="width:100%;">
                🎲 Lanzar dado por el equipo
            </button>`;

    } else if (phase === 'dice') {
        const pos  = roomData.teams?.[ti]?.position ?? 0;
        const dice = roomData.diceResult;
        const faces = ['','⚀','⚁','⚂','⚃','⚄','⚅'];
        ctrl.innerHTML = `
            <div class="dice-result">
                <div class="dice-face">${faces[dice] || dice}</div>
                <div class="dice-text">
                    <strong>${dice}</strong> — ${esc(team.emoji)} ${esc(team.name)}<br>
                    <span style="font-size:.85rem;color:var(--text-dim);">avanza a casilla <strong>${pos}</strong></span>
                </div>
            </div>
            <button onclick="window._next()" class="btn-primary" style="width:100%;margin-top:.75rem;">▶ Siguiente Turno</button>`;

    } else if (phase === 'wrong') {
        ctrl.innerHTML = `
            <div class="wrong-result">
                <div style="font-size:3rem;">❌</div>
                <div style="font-weight:700;color:var(--danger);">${esc(team.emoji)} ${esc(team.name)}<br>no avanza esta vez</div>
            </div>
            <button onclick="window._next()" class="btn-primary" style="width:100%;margin-top:.75rem;">▶ Siguiente Turno</button>`;
    }

    renderStandings(roomData.teams);
}

function renderStandings(teams) {
    const el = document.getElementById('panel-standings');
    if (!el || !teams) return;
    const sorted = Object.entries(teams)
        .map(([i,t]) => ({i:+i,...t}))
        .sort((a,b) => (b.position||0) - (a.position||0));

    el.innerHTML = sorted.map((t, r) => `
        <div class="standing-row">
            <span class="st-rank">${['🥇','🥈','🥉','4.'][r] || `${r+1}.`}</span>
            <span>${t.emoji}</span>
            <span style="flex:1;font-weight:700;font-size:.82rem;color:${t.color};">${esc(t.name)}</span>
            <span style="font-weight:900;font-size:.82rem;">⬡ ${t.position||0}</span>
        </div>`).join('');
}

// ——— FINAL SCREEN ———
function showFinalScreen(roomData) {
    const game = document.getElementById('host-game');
    if (!game || game.querySelector('.final-screen')) return;

    const teams  = roomData.teams || {};
    const sorted = Object.values(teams).sort((a,b) => (b.position||0) - (a.position||0));
    const winner = sorted[0];
    const icons  = ['🥇','🥈','🥉','4️⃣'];

    game.innerHTML = `
        <div class="final-screen">
            <div style="font-size:5rem;margin-bottom:.75rem;">🏆</div>
            <h1 style="font-size:2.8rem;font-weight:900;margin-bottom:.5rem;">¡Fin del Juego!</h1>
            <div style="font-size:1.4rem;font-weight:800;color:${winner?.color};margin-bottom:2rem;">
                ${winner?.emoji} ${esc(winner?.name)} — Casilla ${winner?.position}
            </div>
            <div class="final-table">
                ${sorted.map((t,i) => `
                    <div class="final-row">
                        <span style="font-size:1.5rem;min-width:2rem;">${icons[i]||`${i+1}.`}</span>
                        <span style="font-size:1.3rem;">${t.emoji}</span>
                        <span style="flex:1;font-weight:800;font-size:1.1rem;color:${t.color};">${esc(t.name)}</span>
                        <span style="font-weight:900;font-size:1rem;">Casilla ${t.position||0} / ${BOARD_SIZE}</span>
                    </div>`).join('')}
            </div>
        </div>`;
}

initHost();
