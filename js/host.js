import { db } from './config.js';
import { ALL_QUESTIONS } from './questions.js';
import { ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const BOARD_SIZE = 30;

const AVATARS = [
    { emoji: '🐰', name: 'Conejo',   color: '#FF69B4', grad: 'linear-gradient(135deg,#FF69B4,#C71585)' },
    { emoji: '🐢', name: 'Tortuga',  color: '#4ADE80', grad: 'linear-gradient(135deg,#4ADE80,#16A34A)' },
    { emoji: '🦊', name: 'Zorro',    color: '#FB923C', grad: 'linear-gradient(135deg,#FB923C,#EA580C)' },
    { emoji: '🐻', name: 'Oso',      color: '#D97706', grad: 'linear-gradient(135deg,#D97706,#92400E)' },
    { emoji: '🦁', name: 'León',     color: '#F59E0B', grad: 'linear-gradient(135deg,#FBBF24,#F59E0B)' },
    { emoji: '🐯', name: 'Tigre',    color: '#F97316', grad: 'linear-gradient(135deg,#F97316,#DC2626)' },
    { emoji: '🐺', name: 'Lobo',     color: '#64748B', grad: 'linear-gradient(135deg,#94A3B8,#475569)' },
    { emoji: '🐨', name: 'Koala',    color: '#3B82F6', grad: 'linear-gradient(135deg,#93C5FD,#3B82F6)' },
    { emoji: '🦔', name: 'Erizo',    color: '#9333EA', grad: 'linear-gradient(135deg,#C084FC,#9333EA)' },
    { emoji: '🦌', name: 'Ciervo',   color: '#7C3AED', grad: 'linear-gradient(135deg,#A78BFA,#7C3AED)' },
    { emoji: '🐿️', name: 'Ardilla',  color: '#DC2626', grad: 'linear-gradient(135deg,#F87171,#B91C1C)' },
    { emoji: '🦝', name: 'Mapache',  color: '#059669', grad: 'linear-gradient(135deg,#6EE7B7,#059669)' },
];

let roomId    = null;
let allQ      = [];
let usedQ     = new Set();
let roomState = {};
let hostTimerInterval = null;

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

// Maps square number (1-30) to CSS grid [col, row] (1-indexed)
function squareToGrid(sq) {
    if (sq >= 1  && sq <= 10) return [sq,       7];       // Bottom L→R
    if (sq >= 11 && sq <= 16) return [10,       17-sq];   // Right B→T
    if (sq >= 17 && sq <= 25) return [26-sq,    1];       // Top R→L
    if (sq >= 26 && sq <= 30) return [1,        sq-24];   // Left T→B
    return [1, 7];
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
        currentQuestion:  null,
        questionStartedAt: null,
        questionTimeLimit: 30,
        started: false,
        createdAt: Date.now()
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

        if (roomState.phase === 'question') {
            startHostTimer(roomState.questionStartedAt, roomState.questionTimeLimit || 30);
        } else {
            stopHostTimer();
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
            <div class="lobby-p-item" style="border-color:${av.color}55;background:${av.color}0D;">
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

// ——— GAME ACTIONS ———
window._ask = async function() {
    const q      = getNextQ();
    const limit  = q.timeLimit || 30;
    const snap   = await get(ref(db, `rooms/${roomId}/players`));
    const updates = {
        phase:             'question',
        currentQuestion:   q,
        questionStartedAt: Date.now(),
        questionTimeLimit: limit,
    };
    if (snap.exists()) {
        Object.keys(snap.val()).forEach(pid => {
            updates[`players/${pid}/answered`]     = false;
            updates[`players/${pid}/answerCorrect`] = false;
            updates[`players/${pid}/canRoll`]       = false;
            updates[`players/${pid}/rolled`]        = false;
        });
    }
    await update(ref(db, `rooms/${roomId}`), updates);
};

window._next = async function() {
    stopHostTimer();
    await update(ref(db, `rooms/${roomId}`), {
        phase: 'idle',
        currentQuestion: null,
        questionStartedAt: null,
    });
};

window._end = async function() {
    stopHostTimer();
    await update(ref(db, `rooms/${roomId}`), { phase: 'finished', currentQuestion: null });
};

// ——— TIMER ———
function startHostTimer(startedAt, limit) {
    stopHostTimer();
    if (!startedAt || !limit) return;

    hostTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startedAt) / 1000);
        const left    = Math.max(0, limit - elapsed);
        const pct     = (left / limit) * 100;

        const numEl = document.getElementById('bc-timer-num');
        const barEl = document.getElementById('bc-timer-bar');
        if (numEl) {
            numEl.textContent = left + 's';
            numEl.className   = 'bc-timer-num' + (left <= 10 ? ' urgent' : '');
        }
        if (barEl) {
            barEl.style.width = pct + '%';
            barEl.style.background = left <= 10 ? '#DC2626' : left <= 20 ? '#FBBF24' : '#10B981';
        }

        if (left <= 0) {
            stopHostTimer();
            if (roomState.phase === 'question') window._next();
        }
    }, 500);
}

function stopHostTimer() {
    if (hostTimerInterval) { clearInterval(hostTimerInterval); hostTimerInterval = null; }
}

// ——— PERIMETER BOARD ———
function renderBoard(roomData) {
    const container = document.getElementById('game-board');
    if (!container) return;

    const players = roomData.players || {};
    const posMap  = {};

    Object.entries(players).forEach(([id, p]) => {
        const pos = p.position || 0;
        const av  = AVATARS[p.avatarIdx ?? 0];
        if (pos > 0) (posMap[pos] = posMap[pos] || []).push({id, ...p, av});
    });

    let html = '';

    for (let sq = 1; sq <= BOARD_SIZE; sq++) {
        const [col, row] = squareToGrid(sq);
        const tokens  = posMap[sq] || [];
        const isGoal  = sq === BOARD_SIZE;
        const isMile  = sq % 5 === 0 && !isGoal;
        let cls = 'perim-sq';
        if (isGoal)         cls += ' sq-goal';
        else if (isMile)    cls += ' sq-mile';
        if (tokens.length)  cls += ' sq-has-player';

        html += `<div class="${cls}" style="grid-column:${col};grid-row:${row};">
            <div class="sq-num">${isGoal ? '🏝️' : sq}</div>
            <div class="sq-tokens">
            ${tokens.map(p => `<div class="b-token" style="background:${esc(p.av.grad)};" title="${esc(p.name)}">${p.av.emoji}</div>`).join('')}
            </div>
        </div>`;
    }

    // Build center content
    const phase = roomData.phase;
    const q     = roomData.currentQuestion;
    let centerHtml = '';

    if (phase === 'question' && q) {
        const pList    = getSortedPlayers(roomData);
        const statusHtml = pList.map(p => {
            const av = AVATARS[p.avatarIdx ?? 0];
            let cls = 'bc-status-token bc-st-pending';
            let icon = '⏳';
            if (p.answered) {
                if (p.answerCorrect) { cls = 'bc-status-token bc-st-correct'; icon = '✅'; }
                else                 { cls = 'bc-status-token bc-st-wrong';   icon = '❌'; }
            }
            return `<div class="${cls}" style="border-color:${av.color}44;">
                ${icon} <span>${av.emoji}</span>
            </div>`;
        }).join('');

        const initialLeft = Math.max(0, (roomData.questionTimeLimit || 30));
        const initialPct  = 100;

        centerHtml = `
            <div class="board-center-q">
                <div class="bc-timer-row">
                    <div class="bc-timer-bar-wrap">
                        <div class="bc-timer-bar" id="bc-timer-bar" style="width:${initialPct}%;"></div>
                    </div>
                    <span class="bc-timer-num" id="bc-timer-num">${initialLeft}s</span>
                </div>
                <div class="bc-category">${esc(q.category || '')}</div>
                <div class="bc-question">${esc(q.question)}</div>
                <div class="bc-status-grid">${statusHtml}</div>
            </div>`;
    } else if (phase === 'idle' || phase === 'lobby') {
        centerHtml = `
            <div class="board-center-idle">
                <div class="bc-idle-emoji">🏝️</div>
                <div style="font-size:clamp(.8rem,1.8vw,1.1rem);font-weight:900;color:var(--text);">Camino al Oasis</div>
                <div style="font-size:clamp(.65rem,1.1vw,.82rem);color:var(--text-dim);">Meta: casilla ${BOARD_SIZE} 🏁</div>
            </div>`;
    } else if (phase === 'finished') {
        centerHtml = `
            <div class="board-center-idle">
                <div class="bc-idle-emoji">🏆</div>
                <div style="font-size:clamp(.8rem,1.6vw,1rem);font-weight:900;color:var(--text);">¡Juego Terminado!</div>
            </div>`;
    }

    html += `<div class="perim-center">${centerHtml}</div>`;
    container.innerHTML = html;
}

// ——— SIDE PANEL ———
function updatePanel(roomData, players) {
    const phase = roomData.phase;

    const ctrl = document.getElementById('panel-controls');
    if (ctrl) {
        if (phase === 'idle' || phase === 'lobby') {
            ctrl.innerHTML = `
                <button onclick="window._ask()" class="btn-primary" style="width:100%;font-size:.95rem;padding:.75rem;">
                    ❓ Mostrar Pregunta
                </button>
                <button onclick="window._end()" class="btn-secondary btn-sm" style="margin-top:.5rem;width:100%;">
                    🏁 Terminar Juego
                </button>`;

        } else if (phase === 'question') {
            const q         = roomData.currentQuestion;
            const answered  = players.filter(p => p.answered).length;
            const correct   = players.filter(p => p.answerCorrect).length;
            const letters   = ['A','B','C','D'];

            ctrl.innerHTML = `
                ${q ? `<div class="host-q-card">
                    <div class="hq-cat">${esc(q.category || '')}</div>
                    <div class="hq-text">${esc(q.question)}</div>
                    <div style="font-size:.72rem;color:var(--text-dim);font-weight:700;margin:.3rem 0;">
                        ✅ Correcta: <strong>${letters[q.correct]}) ${esc((q.options||[])[q.correct]||'')}</strong>
                    </div>
                    <div style="font-size:.75rem;color:var(--text-dim);font-weight:700;">
                        Respondieron: ${answered}/${players.length} — Correctos: ${correct}
                    </div>
                </div>` : ''}
                <button onclick="window._next()" class="btn-primary" style="width:100%;font-size:.9rem;padding:.7rem;">
                    ⏭ Siguiente Pregunta
                </button>`;
        }
    }

    // Standing in side panel
    renderStandings(roomData, players);
}

function renderStandings(roomData, players) {
    const el = document.getElementById('panel-standings');
    if (!el) return;
    const sorted = [...players].sort((a,b) => (b.position||0) - (a.position||0));
    const icons  = ['🥇','🥈','🥉'];
    el.innerHTML = sorted.map((p, r) => {
        const av       = AVATARS[p.avatarIdx ?? 0];
        const canRoll  = p.canRoll && !p.rolled;
        return `
        <div class="standing-row">
            <span class="st-rank">${icons[r] || `${r+1}.`}</span>
            <span style="font-size:1.1rem;">${av.emoji}</span>
            <span style="flex:1;font-weight:700;font-size:.82rem;color:${av.color};">${esc(p.name)}${canRoll ? ' 🎲' : ''}</span>
            <span style="font-weight:900;font-size:.82rem;color:var(--text);">⬡ ${p.position||0}</span>
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
    const icons    = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣'];

    game.innerHTML = `
        <div class="final-screen">
            <div style="font-size:5rem;margin-bottom:.5rem;animation:popIn .5s ease;">🏝️</div>
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
                        <span style="font-weight:900;color:var(--text);">Casilla ${p.position||0} / ${BOARD_SIZE}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

initHost();
