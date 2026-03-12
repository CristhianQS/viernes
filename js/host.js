import { db } from './config.js';
import { ALL_QUESTIONS } from './questions.js';
import { ref, set, get, push, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ——— Constantes ———
const TOTAL_QUESTIONS = 10;

// Posiciones en la montaña (left%, top%) desde base (step 0) hasta cumbre (step 10)
const MOUNTAIN_POS = [
    { left: 50.0, top: 87.5 }, // 0 correcto  — base
    { left: 49.3, top: 79.8 }, // 1
    { left: 48.5, top: 72.1 }, // 2
    { left: 47.3, top: 64.4 }, // 3
    { left: 46.5, top: 56.7 }, // 4
    { left: 46.0, top: 49.0 }, // 5
    { left: 45.5, top: 41.5 }, // 6
    { left: 45.2, top: 34.0 }, // 7
    { left: 45.5, top: 26.5 }, // 8
    { left: 46.5, top: 19.0 }, // 9
    { left: 50.0, top: 10.6 }, // 10 correcto — cumbre
];

// ——— Estado ———
let roomId = null;
let prevCorrect = {};   // rastrear conteos anteriores para animación climbing
let climbingIds = new Set();

// ——— Utilidades ———
function generateRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id = '';
    for (let i = 0; i < 6; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

function selectRandom(pool, count) {
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, shuffled.length));
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ——— Inicialización ———
async function initHost() {
    roomId = generateRoomId();

    // Intentar cargar banco de preguntas de Firebase, sino usar locales
    let pool = ALL_QUESTIONS;
    try {
        const bankSnap = await get(ref(db, 'question-bank'));
        if (bankSnap.exists()) {
            const custom = Object.values(bankSnap.val());
            if (custom.length >= TOTAL_QUESTIONS) pool = custom;
        }
    } catch (_) {
        // usar pool local
    }

    const selected = selectRandom(pool, TOTAL_QUESTIONS);

    // Guardar sala en Firebase con preguntas completas y started: false
    await set(ref(db, `rooms/${roomId}`), {
        questions: selected,
        createdAt: Date.now(),
        started: false
    });

    // Construir URL del jugador
    const loc = window.location;
    const pathDir = loc.pathname.substring(0, loc.pathname.lastIndexOf('/') + 1);
    const playerUrl = loc.origin + pathDir + 'player.html?room=' + roomId;

    // Mostrar roomId en lobby
    document.getElementById('room-code-text').textContent = roomId;
    document.getElementById('side-room-code').textContent = roomId;
    document.getElementById('join-url').textContent = playerUrl;

    // Generar QR grande en lobby
    new window.QRCode(document.getElementById('qr-code'), {
        text: playerUrl,
        width: 220,
        height: 220,
        colorDark: '#1a1a2e',
        colorLight: '#ffffff'
    });

    // Generar QR pequeño en panel lateral
    new window.QRCode(document.getElementById('qr-small'), {
        text: playerUrl,
        width: 100,
        height: 100,
        colorDark: '#1a1a2e',
        colorLight: '#ffffff'
    });

    // Escuchar jugadores en tiempo real
    onValue(ref(db, `rooms/${roomId}/players`), (snapshot) => {
        const data = snapshot.val();
        const players = data ? Object.entries(data).map(([id, p]) => ({ id, ...p })) : [];
        renderLobbyPlayers(players);
        renderTokens(players);
        renderLeaderboard(players);
    });

    // Botón "Iniciar Juego" → pone started: true en Firebase y transiciona
    document.getElementById('btn-start-game').addEventListener('click', async () => {
        const btn = document.getElementById('btn-start-game');
        btn.disabled = true;
        btn.textContent = '⏳ Iniciando...';
        try {
            await set(ref(db, `rooms/${roomId}/started`), true);
            document.getElementById('host-lobby').classList.remove('active');
            document.getElementById('host-mountain').classList.add('active');
        } catch (err) {
            console.error('Error al iniciar juego:', err);
            btn.disabled = false;
            btn.textContent = '🚀 Iniciar Juego';
        }
    });
}

// ——— Lobby: lista de jugadores ———
function renderLobbyPlayers(players) {
    const list = document.getElementById('lobby-player-list');
    const count = document.getElementById('lobby-count');
    const btn = document.getElementById('btn-start-game');

    count.textContent = players.length;
    btn.disabled = players.length < 1;

    list.innerHTML = players.map(p => `
        <div class="lobby-player-item">
            <div class="player-avatar-mini" style="background:${escHtml(p.grad || 'rgba(255,255,255,0.1)')};">
                ${p.emoji || '🧗'}
            </div>
            <span>${escHtml(p.name || 'Jugador')}</span>
            ${p.finished ? '<span style="margin-left:auto;color:#00FF94;font-size:.75rem;">✓ Terminó</span>' : ''}
        </div>
    `).join('');
}

// ——— Tokens en la montaña ———
function renderTokens(players) {
    const container = document.getElementById('host-tokens');
    if (!container) return;

    // Detectar jugadores que subieron de nivel
    players.forEach(p => {
        const prev = prevCorrect[p.id] || 0;
        if ((p.correct || 0) > prev) {
            prevCorrect[p.id] = p.correct;
            climbingIds.add(p.id);
            setTimeout(() => climbingIds.delete(p.id), 800);
        }
    });

    // Agrupar por nivel (correct count)
    const groups = {};
    players.forEach(p => {
        const lvl = Math.min(p.correct || 0, TOTAL_QUESTIONS);
        if (!groups[lvl]) groups[lvl] = [];
        groups[lvl].push(p);
    });

    container.innerHTML = '';
    Object.entries(groups).forEach(([lvl, group]) => {
        const pos = MOUNTAIN_POS[parseInt(lvl, 10)] || MOUNTAIN_POS[0];
        group.forEach((p, idx) => {
            const size = group.length;
            const spread = (idx - (size - 1) / 2) * 5;
            const left = pos.left + spread;
            const top = pos.top;

            const isClimbing = climbingIds.has(p.id);
            const grad = p.grad || 'linear-gradient(135deg,#FF4ECD,#7B2FFF)';
            const color = p.color || '#FF4ECD';

            const token = document.createElement('div');
            token.className = 'host-token' + (isClimbing ? ' climbing' : '');
            token.dataset.pid = p.id;
            token.style.left = left + '%';
            token.style.top = top + '%';
            token.innerHTML = `
                <div class="host-token-circle" style="background:${escHtml(grad)};--tok-color:${escHtml(color)};">
                    ${p.emoji || '🧗'}
                </div>
                <div class="host-token-label">${escHtml(p.name || 'Jugador')}</div>
            `;
            container.appendChild(token);
        });
    });
}

// ——— Leaderboard lateral ———
function renderLeaderboard(players) {
    const container = document.getElementById('host-leaderboard');
    if (!container) return;

    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const top8 = sorted.slice(0, 8);
    const rankIcons = ['🥇', '🥈', '🥉'];

    container.innerHTML = top8.map((p, i) => {
        const rank = rankIcons[i] || `${i + 1}.`;
        return `
            <div class="host-lb-item">
                <span style="min-width:24px; font-weight:900; font-size:0.9rem;">${rank}</span>
                <span style="font-size:1rem;">${p.emoji || '🧗'}</span>
                <span style="flex:1; font-weight:700; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(p.name || 'Jugador')}</span>
                <span style="font-weight:900; font-size:0.85rem; color:var(--gold);">${p.score || 0}</span>
            </div>
        `;
    }).join('');
}

// ——— Arrancar ———
initHost();
