// ================================================================
//  SUBE LA MONTAÑA — Lógica Principal (Firebase SDK Modular v10)
// ================================================================
import { db }                  from './config.js';
import { getRandomQuestions }  from './questions.js';
import {
    ref, set, push, get, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ── Constantes ───────────────────────────────────────────────────
const TOTAL_QUESTIONS = 10;
const TIMER_SECONDS   = 15;
const POINTS_CORRECT  = 100;
const BONUS_MAX       = 50;

// Posiciones en la montaña (% del contenedor SVG, 0-10 correctas)
const MOUNTAIN_POS = [
    { left: 50.0, top: 87.5 },
    { left: 49.0, top: 79.8 },
    { left: 47.8, top: 72.1 },
    { left: 46.5, top: 64.4 },
    { left: 45.8, top: 56.7 },
    { left: 45.0, top: 49.0 },
    { left: 44.8, top: 41.3 },
    { left: 45.0, top: 33.7 },
    { left: 45.5, top: 26.9 },
    { left: 47.8, top: 19.2 },
    { left: 50.0, top: 10.6 },
];

// ── Estado ───────────────────────────────────────────────────────
const state = {
    playerName:      '',
    playerEmoji:     '',
    playerCharacter: '',
    playerId:        null,
    questions:       [],
    currentQ:        0,
    score:           0,
    correctCount:    0,
    timerInterval:   null,
    timeLeft:        TIMER_SECONDS,
    answered:        false,
    gameOver:        false,
    liveListener:    null,
};

// ── Helpers DOM ───────────────────────────────────────────────────
const $  = id  => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function showScreen(id) {
    $$('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const target = $(id);
    target.style.display = 'flex';
    requestAnimationFrame(() => target.classList.add('active'));
}

// ── PANTALLA 1: Bienvenida ────────────────────────────────────────
$('btn-welcome-next').addEventListener('click', () => {
    const name = $('player-name').value.trim();
    if (!name) {
        $('player-name').focus();
        $('player-name').style.borderColor = '#f44336';
        return;
    }
    state.playerName = name;
    showScreen('screen-character');
});

$('player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('btn-welcome-next').click();
});

$('player-name').addEventListener('input', () => {
    $('player-name').style.borderColor = '';
});

// ── PANTALLA 2: Selección de personaje ───────────────────────────
let selectedCard = null;

$$('.character-card').forEach(card => {
    card.addEventListener('click', () => {
        if (selectedCard) selectedCard.classList.remove('selected');
        card.classList.add('selected');
        selectedCard          = card;
        state.playerEmoji     = card.dataset.emoji;
        state.playerCharacter = card.dataset.character;
        $('btn-choose-character').disabled = false;
    });
});

$('btn-choose-character').addEventListener('click', () => {
    if (!state.playerCharacter) return;
    initGame();
});

// ── INICIO DEL JUEGO ─────────────────────────────────────────────
function initGame() {
    state.questions    = getRandomQuestions(TOTAL_QUESTIONS);
    state.currentQ     = 0;
    state.score        = 0;
    state.correctCount = 0;
    state.gameOver     = false;

    $('hdr-char').textContent = state.playerEmoji;
    $('hdr-name').textContent = state.playerName;
    $('q-total').textContent  = TOTAL_QUESTIONS;

    registerPlayer();
    showScreen('screen-game');
    renderQuestion();
}

// ── FIREBASE: Registrar jugador ───────────────────────────────────
async function registerPlayer() {
    try {
        const playersRef  = ref(db, 'players');
        const newPlayerRef = push(playersRef);
        state.playerId    = newPlayerRef.key;

        await saveProgress();

        // Escuchar cambios en tiempo real de todos los jugadores
        state.liveListener = onValue(playersRef, snapshot => {
            const players = [];
            snapshot.forEach(child => {
                players.push({ id: child.key, ...child.val() });
            });
            renderLiveLeaderboard(players);
        });

        window.addEventListener('beforeunload', removePlayer);
    } catch (err) {
        console.warn('Firebase: error al registrar jugador.', err.message);
    }
}

async function saveProgress() {
    if (!state.playerId) return;
    try {
        await set(ref(db, `players/${state.playerId}`), {
            name:     state.playerName,
            emoji:    state.playerEmoji,
            score:    state.score,
            correct:  state.correctCount,
            finished: state.gameOver,
            ts:       Date.now()
        });
    } catch (err) {
        console.warn('Firebase: error al guardar.', err.message);
    }
}

function removePlayer() {
    if (!state.playerId) return;
    try { remove(ref(db, `players/${state.playerId}`)); } catch (_) {}
}

// ── RANKING EN VIVO ───────────────────────────────────────────────
function renderLiveLeaderboard(players) {
    players.sort((a, b) => b.score - a.score);

    const list = $('leaderboard-list');
    list.innerHTML = '';
    const rankIcons = ['🥇','🥈','🥉'];

    players.slice(0, 8).forEach((p, i) => {
        const div = document.createElement('div');
        div.className = 'lb-item';
        div.innerHTML = `
            <span class="lb-rank">${rankIcons[i] || (i + 1)}</span>
            <span class="lb-emoji">${p.emoji || '❓'}</span>
            <span class="lb-name">${p.name || 'Jugador'}</span>
            <span class="lb-progress">${p.correct || 0}/${TOTAL_QUESTIONS}</span>
        `;
        list.appendChild(div);
    });

    renderMountainPlayers(players);
}

// ── MONTAÑA: Tokens de jugadores ─────────────────────────────────
function renderMountainPlayers(players) {
    const overlay = $('players-on-mountain');
    overlay.innerHTML = '';

    players.forEach(p => {
        const step  = Math.min(p.correct || 0, TOTAL_QUESTIONS);
        const pos   = MOUNTAIN_POS[step];
        const isSelf = p.id === state.playerId;

        const token = document.createElement('div');
        token.className   = 'player-token';
        token.style.left  = pos.left + '%';
        token.style.top   = pos.top  + '%';
        if (isSelf) token.style.zIndex = 20;
        token.innerHTML = `
            <span class="token-emoji">${p.emoji || '❓'}</span>
            <span class="token-name">${isSelf ? '★ ' : ''}${p.name || 'Jugador'}</span>
        `;
        overlay.appendChild(token);
    });
}

// ── PREGUNTA ──────────────────────────────────────────────────────
function renderQuestion() {
    if (state.currentQ >= state.questions.length) {
        endGame();
        return;
    }

    const q = state.questions[state.currentQ];
    state.answered = false;

    $('q-num').textContent      = state.currentQ + 1;
    $('score-display').textContent = state.score;
    $('q-category').textContent = q.category;
    $('q-text').textContent     = q.question;

    const letters    = ['A','B','C','D'];
    const container  = $('options-container');
    container.innerHTML = '';

    q.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = `<span class="opt-letter">${letters[idx]}</span> ${opt}`;
        btn.addEventListener('click', () => handleAnswer(idx, btn));
        container.appendChild(btn);
    });

    hideFeedback();

    const pct = (state.correctCount / TOTAL_QUESTIONS) * 100;
    $('mobile-fill').style.width = pct + '%';

    startTimer();
}

// ── TIMER ─────────────────────────────────────────────────────────
function startTimer() {
    clearInterval(state.timerInterval);
    state.timeLeft = TIMER_SECONDS;
    updateTimerUI(TIMER_SECONDS);

    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        updateTimerUI(state.timeLeft);
        if (state.timeLeft <= 0) {
            clearInterval(state.timerInterval);
            handleTimeout();
        }
    }, 1000);
}

function updateTimerUI(seconds) {
    $('timer-num').textContent = seconds;
    const fill = $('timer-fill');
    fill.style.width = (seconds / TIMER_SECONDS * 100) + '%';
    fill.classList.remove('warn','danger');
    if (seconds <= 5)       fill.classList.add('danger');
    else if (seconds <= 8)  fill.classList.add('warn');
}

function stopTimer() { clearInterval(state.timerInterval); }

// ── RESPUESTA ─────────────────────────────────────────────────────
function handleAnswer(selectedIdx, clickedBtn) {
    if (state.answered) return;
    state.answered = true;
    stopTimer();

    const q         = state.questions[state.currentQ];
    const isCorrect = selectedIdx === q.correct;

    $$('.option-btn').forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct');
    });

    if (isCorrect) {
        const bonus  = Math.round((state.timeLeft / TIMER_SECONDS) * BONUS_MAX);
        const earned = POINTS_CORRECT + bonus;
        state.score        += earned;
        state.correctCount += 1;
        showFeedback('correct', `✅ ¡Correcto! +${earned} puntos`);
    } else {
        clickedBtn.classList.add('wrong');
        showFeedback('wrong', `❌ Era: "${q.options[q.correct]}"`);
    }

    saveProgress();
    setTimeout(nextQuestion, 1800);
}

function handleTimeout() {
    if (state.answered) return;
    state.answered = true;

    const q = state.questions[state.currentQ];
    $$('.option-btn').forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct');
    });

    showFeedback('timeout', `⏰ ¡Tiempo! Era: "${q.options[q.correct]}"`);
    saveProgress();
    setTimeout(nextQuestion, 1800);
}

function nextQuestion() {
    state.currentQ++;
    renderQuestion();
}

// ── FEEDBACK ──────────────────────────────────────────────────────
function showFeedback(type, text) {
    const box = $('feedback-box');
    box.className = `feedback-box ${type}-fb`;
    $('feedback-icon').textContent = '';
    $('feedback-text').textContent = text;
}

function hideFeedback() {
    $('feedback-box').className = 'feedback-box hidden';
}

// ── FIN DEL JUEGO ────────────────────────────────────────────────
async function endGame() {
    state.gameOver = true;
    await saveProgress();

    // Detener listener en vivo
    if (state.liveListener) {
        state.liveListener();   // onValue devuelve función para desuscribirse
        state.liveListener = null;
    }

    let emoji, title;
    if (state.correctCount === TOTAL_QUESTIONS) {
        emoji = '🏆'; title = '¡Llegaste a la cima!';
    } else if (state.correctCount >= 7) {
        emoji = '⭐'; title = '¡Excelente escalada!';
    } else if (state.correctCount >= 4) {
        emoji = '👍'; title = '¡Buen intento!';
    } else {
        emoji = '💪'; title = '¡Sigue entrenando!';
    }

    $('result-emoji').textContent = emoji;
    $('result-title').textContent = title;

    $('result-card').innerHTML = `
        <div class="result-stat">
            <span class="r-label">Personaje</span>
            <span class="r-val">${state.playerEmoji} ${state.playerName}</span>
        </div>
        <div class="result-stat">
            <span class="r-label">Respuestas correctas</span>
            <span class="r-val">${state.correctCount} / ${TOTAL_QUESTIONS}</span>
        </div>
        <div class="result-stat">
            <span class="r-label">Puntuación final</span>
            <span class="r-val" style="color:#FFD700">⭐ ${state.score}</span>
        </div>
        <div class="result-stat">
            <span class="r-label">Altura alcanzada</span>
            <span class="r-val">${Math.round((state.correctCount / TOTAL_QUESTIONS) * 100)}%</span>
        </div>
    `;

    // Tabla final desde Firebase
    try {
        const snapshot = await get(ref(db, 'players'));
        const players  = [];
        snapshot.forEach(c => players.push({ id: c.key, ...c.val() }));
        players.sort((a, b) => b.score - a.score);
        renderFinalLeaderboard(players);
    } catch (_) {
        renderFinalLeaderboard([]);
    }

    showScreen('screen-results');
}

function renderFinalLeaderboard(players) {
    const container = $('final-leaderboard');
    container.innerHTML = '';

    if (!players.length) {
        container.innerHTML = '<p style="color:var(--text-dim);text-align:center;font-size:.85rem">Sin datos en línea</p>';
        return;
    }

    const rankIcons = ['🥇','🥈','🥉'];
    players.slice(0, 10).forEach((p, i) => {
        const isMe = p.id === state.playerId;
        const div  = document.createElement('div');
        div.className = 'final-item';
        if (isMe) div.style.background = 'rgba(108,99,255,.2)';
        div.innerHTML = `
            <span class="fi-rank">${rankIcons[i] || (i + 1)}</span>
            <span class="fi-emoji">${p.emoji || '❓'}</span>
            <span class="fi-name">${p.name || 'Jugador'}${isMe ? ' (tú)' : ''}</span>
            <span class="fi-score">⭐ ${p.score || 0}</span>
        `;
        container.appendChild(div);
    });
}

// ── BOTONES RESULTADOS ────────────────────────────────────────────
$('btn-play-again').addEventListener('click', () => {
    removePlayer();
    state.playerId = null;

    if (selectedCard) { selectedCard.classList.remove('selected'); selectedCard = null; }
    state.playerCharacter = '';
    state.playerEmoji     = '';
    $('btn-choose-character').disabled = true;
    $('player-name').value = '';

    showScreen('screen-welcome');
});

$('btn-share').addEventListener('click', () => {
    const text = `🏔️ Subí la montaña con ${state.correctCount}/${TOTAL_QUESTIONS} correctas y ${state.score} pts! ¿Puedes superarme? ⛰️`;
    if (navigator.share) {
        navigator.share({ title: 'Sube la Montaña', text });
    } else {
        navigator.clipboard.writeText(text)
            .then(() => alert('¡Copiado al portapapeles! 🎉'))
            .catch(() => alert(text));
    }
});
