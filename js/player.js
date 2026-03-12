import { db } from './config.js';
import { ALL_QUESTIONS } from './questions.js';
import { ref, set, get, push, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ——— Constantes ———
const TOTAL_QUESTIONS = 10;
const TIMER_SECONDS   = 15;
const POINTS_CORRECT  = 100;
const BONUS_MAX       = 50;

// ——— Estado del juego ———
const state = {
    roomId:        null,
    playerId:      null,
    playerName:    '',
    playerEmoji:   '',
    playerChar:    '',
    questions:     [],
    currentQ:      0,
    score:         0,
    correctCount:  0,
    answered:      false,
    timeLeft:      TIMER_SECONDS,
    timerInterval: null,
    gameOver:      false
};

// ——— Utilidades DOM ———
function showScreen(id) {
    document.querySelectorAll('.p-screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ——— INIT ———
function init() {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');

    if (!room) {
        showJoinError('Sala no encontrada. Escanea el QR nuevamente.');
        showScreen('p-join');
        return;
    }

    state.roomId = room.toUpperCase();
    document.getElementById('p-room-display').textContent = state.roomId;
    showScreen('p-join');

    // Botón siguiente en join
    document.getElementById('btn-join-next').addEventListener('click', handleJoinNext);
    document.getElementById('p-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') handleJoinNext();
    });

    // Selección de personaje
    document.querySelectorAll('#p-char-grid .character-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('#p-char-grid .character-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            state.playerEmoji = card.dataset.emoji;
            state.playerChar  = card.dataset.character;
            document.getElementById('btn-char-play').disabled = false;
            document.getElementById('p-char-error').textContent = '';
        });
    });

    document.getElementById('btn-char-play').addEventListener('click', handleCharPlay);

    document.getElementById('btn-play-again').addEventListener('click', () => {
        window.location.reload();
    });
}

// ——— JOIN ———
function handleJoinNext() {
    const nameInput = document.getElementById('p-name');
    const name = nameInput.value.trim();
    if (!name) {
        showJoinError('Por favor escribe tu nombre.');
        nameInput.focus();
        return;
    }
    state.playerName = name;
    document.getElementById('p-join-error').textContent = '';
    showScreen('p-char');
}

function showJoinError(msg) {
    const el = document.getElementById('p-join-error');
    if (el) el.textContent = msg;
}

// ——— CHARACTER ———
function handleCharPlay() {
    if (!state.playerEmoji) {
        document.getElementById('p-char-error').textContent = 'Elige un personaje primero.';
        return;
    }
    document.getElementById('p-char-error').textContent = '';
    loadRoomAndStart();
}

// ——— CARGAR SALA Y EMPEZAR ———
async function loadRoomAndStart() {
    const btn = document.getElementById('btn-char-play');
    btn.disabled = true;
    btn.textContent = 'Cargando...';

    try {
        const roomSnap = await get(ref(db, `rooms/${state.roomId}`));
        if (!roomSnap.exists()) {
            document.getElementById('p-char-error').textContent = 'Sala no encontrada. Verifica el código.';
            btn.disabled = false;
            btn.textContent = '¡Jugar! 🏔️';
            return;
        }

        const roomData = roomSnap.val();
        const indices = roomData.questions || [];

        // Mapear índices a preguntas
        state.questions = indices.map(i => ALL_QUESTIONS[i]).filter(Boolean);

        if (state.questions.length === 0) {
            document.getElementById('p-char-error').textContent = 'Error al cargar preguntas. Intenta de nuevo.';
            btn.disabled = false;
            btn.textContent = '¡Jugar! 🏔️';
            return;
        }

        // Crear jugador en Firebase
        const playerRef = push(ref(db, `rooms/${state.roomId}/players`));
        state.playerId = playerRef.key;

        await set(playerRef, {
            name:      state.playerName,
            emoji:     state.playerEmoji,
            character: state.playerChar,
            score:     0,
            correct:   0,
            currentQ:  0,
            finished:  false,
            joinedAt:  Date.now()
        });

        // Mostrar pantalla quiz
        document.getElementById('p-char-hdr').textContent  = state.playerEmoji;
        document.getElementById('p-name-hdr').textContent  = state.playerName;
        document.getElementById('p-q-total').textContent   = state.questions.length;
        document.getElementById('p-mountain-emoji').textContent = state.playerEmoji;

        showScreen('p-quiz');
        renderQuestion();

    } catch (err) {
        console.error('Error al unirse a la sala:', err);
        document.getElementById('p-char-error').textContent = 'Error de conexión. Intenta de nuevo.';
        btn.disabled = false;
        btn.textContent = '¡Jugar! 🏔️';
    }
}

// ——— RENDERIZAR PREGUNTA ———
function renderQuestion() {
    if (state.currentQ >= state.questions.length) {
        endGame();
        return;
    }

    const q = state.questions[state.currentQ];
    state.answered = false;

    // Actualizar header
    document.getElementById('p-q-num').textContent  = state.currentQ + 1;
    document.getElementById('p-score').textContent  = state.score;
    document.getElementById('p-category').textContent  = q.category;
    document.getElementById('p-question').textContent  = q.question;

    // Limpiar feedback
    const feedback = document.getElementById('p-feedback');
    feedback.className = 'feedback-box hidden';
    feedback.innerHTML = '';

    // Actualizar barra de progreso de montaña
    const pct = (state.correctCount / state.questions.length) * 100;
    document.getElementById('p-mountain-bar').style.width = pct + '%';

    // Renderizar opciones
    const optContainer = document.getElementById('p-options');
    const letters = ['A', 'B', 'C', 'D'];
    optContainer.innerHTML = q.options.map((opt, i) => `
        <button class="option-btn" data-idx="${i}">
            <span class="opt-letter">${letters[i]}</span>
            ${escHtml(opt)}
        </button>
    `).join('');

    optContainer.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!state.answered) handleAnswer(parseInt(btn.dataset.idx, 10));
        });
    });

    // Iniciar timer
    startTimer();
}

// ——— TIMER ———
function startTimer() {
    clearInterval(state.timerInterval);
    state.timeLeft = TIMER_SECONDS;

    const fillEl = document.getElementById('p-timer-fill');
    const numEl  = document.getElementById('p-timer-num');

    fillEl.style.width = '100%';
    fillEl.className = 'timer-fill';
    numEl.textContent = TIMER_SECONDS;

    state.timerInterval = setInterval(() => {
        state.timeLeft--;
        numEl.textContent = state.timeLeft;
        const pct = (state.timeLeft / TIMER_SECONDS) * 100;
        fillEl.style.width = pct + '%';

        if (state.timeLeft <= 5) {
            fillEl.className = 'timer-fill danger';
        } else if (state.timeLeft <= 8) {
            fillEl.className = 'timer-fill warn';
        }

        if (state.timeLeft <= 0) {
            clearInterval(state.timerInterval);
            if (!state.answered) handleTimeout();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(state.timerInterval);
}

// ——— RESPONDER ———
function handleAnswer(idx) {
    if (state.answered) return;
    state.answered = true;
    stopTimer();

    const q = state.questions[state.currentQ];
    const isCorrect = idx === q.correct;
    const buttons = document.querySelectorAll('#p-options .option-btn');

    // Highlight correcto e incorrecto
    buttons.forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct');
        if (i === idx && !isCorrect) btn.classList.add('wrong');
    });

    if (isCorrect) {
        const bonus = Math.round((state.timeLeft / TIMER_SECONDS) * BONUS_MAX);
        state.score += POINTS_CORRECT + bonus;
        state.correctCount++;
        showFeedback('correct-fb', '✅', `¡Correcto! +${POINTS_CORRECT + bonus} pts`);
    } else {
        const correctText = q.options[q.correct];
        showFeedback('wrong-fb', '❌', `Incorrecto. Era: ${correctText}`);
    }

    // Actualizar score en header
    document.getElementById('p-score').textContent = state.score;

    saveProgress();
    setTimeout(() => nextQuestion(), 1800);
}

function handleTimeout() {
    if (state.answered) return;
    state.answered = true;

    const q = state.questions[state.currentQ];
    const buttons = document.querySelectorAll('#p-options .option-btn');
    buttons.forEach((btn, i) => {
        btn.disabled = true;
        if (i === q.correct) btn.classList.add('correct');
    });

    showFeedback('timeout-fb', '⏰', `¡Tiempo! Era: ${q.options[q.correct]}`);
    saveProgress();
    setTimeout(() => nextQuestion(), 1800);
}

function showFeedback(cls, icon, text) {
    const el = document.getElementById('p-feedback');
    el.className = `feedback-box ${cls}`;
    el.innerHTML = `<span style="font-size:1.35rem;">${icon}</span><span>${escHtml(text)}</span>`;
}

// ——— SIGUIENTE PREGUNTA ———
function nextQuestion() {
    state.currentQ++;
    if (state.currentQ >= state.questions.length) {
        endGame();
    } else {
        renderQuestion();
    }
}

// ——— GUARDAR PROGRESO ———
async function saveProgress() {
    if (!state.playerId || !state.roomId) return;
    try {
        await set(ref(db, `rooms/${state.roomId}/players/${state.playerId}`), {
            name:      state.playerName,
            emoji:     state.playerEmoji,
            character: state.playerChar,
            score:     state.score,
            correct:   state.correctCount,
            currentQ:  state.currentQ,
            finished:  state.gameOver,
            ts:        Date.now()
        });
    } catch (err) {
        console.error('Error guardando progreso:', err);
    }
}

// ——— FIN DEL JUEGO ———
async function endGame() {
    state.gameOver = true;
    stopTimer();
    await saveProgress();

    // Determinar resultado
    const pct = state.correctCount / state.questions.length;
    let resultEmoji, resultTitle;
    if (pct >= 0.9) {
        resultEmoji = '🏆';
        resultTitle = '¡Alcanzaste la cumbre!';
    } else if (pct >= 0.7) {
        resultEmoji = '⭐';
        resultTitle = '¡Excelente escalada!';
    } else if (pct >= 0.5) {
        resultEmoji = '👍';
        resultTitle = '¡Buen intento!';
    } else {
        resultEmoji = '💪';
        resultTitle = '¡Sigue practicando!';
    }

    document.getElementById('p-result-emoji').textContent   = resultEmoji;
    document.getElementById('p-result-title').textContent   = resultTitle;
    document.getElementById('p-final-score').textContent    = state.score;
    document.getElementById('p-final-correct').textContent  = `${state.correctCount} / ${state.questions.length}`;
    document.getElementById('p-final-char').textContent     = `${state.playerEmoji} ${state.playerChar}`;

    showScreen('p-done');

    // Cargar tabla final y escuchar en tiempo real
    onValue(ref(db, `rooms/${state.roomId}/players`), (snap) => {
        const data = snap.val();
        if (!data) return;
        const players = Object.entries(data).map(([id, p]) => ({ id, ...p }));
        renderFinalBoard(players);
    });
}

// ——— TABLA FINAL ———
function renderFinalBoard(players) {
    const container = document.getElementById('p-final-board');
    if (!container) return;

    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const top5 = sorted.slice(0, 5);
    const rankIcons = ['🥇', '🥈', '🥉'];

    container.innerHTML = top5.map((p, i) => {
        const rank = rankIcons[i] || `${i + 1}.`;
        const isMe = p.id === state.playerId;
        return `
            <div class="final-item" style="${isMe ? 'background:rgba(108,99,255,.15); border-radius:8px; padding:0.35rem 0.5rem;' : ''}">
                <span class="fi-rank">${rank}</span>
                <span class="fi-emoji">${p.emoji || '🧗'}</span>
                <span class="fi-name">${escHtml(p.name || 'Jugador')}${isMe ? ' (tú)' : ''}</span>
                <span class="fi-score">${p.score || 0}</span>
            </div>
        `;
    }).join('');
}

// ——— Arrancar ———
init();
