import { db } from './config.js';
import { ALL_QUESTIONS } from './questions.js';
import { ref, set, push, remove, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ——— LOGIN ———
const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';
const SESSION_KEY = 'mtq_admin_auth';

function checkLogin() {
    return sessionStorage.getItem(SESSION_KEY) === '1';
}

function showAdminContent() {
    document.getElementById('admin-login').style.display  = 'none';
    document.getElementById('admin-content').style.display = 'block';
    initAdmin();
}

if (checkLogin()) {
    showAdminContent();
} else {
    const loginBtn  = document.getElementById('login-btn');
    const loginUser = document.getElementById('login-user');
    const loginPass = document.getElementById('login-pass');
    const loginErr  = document.getElementById('login-error');

    function attemptLogin() {
        const u = loginUser.value.trim();
        const p = loginPass.value;
        if (u === ADMIN_USER && p === ADMIN_PASS) {
            sessionStorage.setItem(SESSION_KEY, '1');
            showAdminContent();
        } else {
            loginErr.textContent = 'Usuario o contraseña incorrectos.';
            loginPass.value = '';
            loginPass.focus();
        }
    }

    loginBtn.addEventListener('click', attemptLogin);
    loginPass.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });
    loginUser.addEventListener('keydown', e => { if (e.key === 'Enter') loginPass.focus(); });
}

// ——— Estado del formulario ———
let selectedCorrect = 0;
let editingId = null;

function initAdmin() {

// ——— Selector de respuesta correcta ———
document.querySelectorAll('.correct-opt').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.correct-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedCorrect = parseInt(btn.dataset.val, 10);
    });
});

// ——— Guardar pregunta (nueva o editar) ———
document.getElementById('btn-save-q').addEventListener('click', saveQuestion);

async function saveQuestion() {
    const category = document.getElementById('f-category').value;
    const question  = document.getElementById('f-question').value.trim();
    const opts = [0,1,2,3].map(i => document.getElementById(`f-opt${i}`).value.trim());
    const errEl = document.getElementById('form-error');

    if (!question)           { errEl.textContent = 'Escribe la pregunta.'; return; }
    if (opts.some(o => !o)) { errEl.textContent = 'Completa todas las opciones.'; return; }
    errEl.textContent = '';

    const data = { category, question, options: opts, correct: selectedCorrect };

    try {
        if (editingId) {
            await set(ref(db, `question-bank/${editingId}`), data);
        } else {
            await push(ref(db, 'question-bank'), data);
        }
        resetForm();
    } catch (err) {
        errEl.textContent = 'Error al guardar: ' + err.message;
    }
}

// ——— Resetear formulario ———
function resetForm() {
    document.getElementById('f-question').value = '';
    [0,1,2,3].forEach(i => { document.getElementById(`f-opt${i}`).value = ''; });
    document.querySelectorAll('.correct-opt').forEach(b => b.classList.remove('active'));
    document.querySelector('.correct-opt[data-val="0"]').classList.add('active');
    selectedCorrect = 0;
    editingId = null;
    document.getElementById('edit-id').value = '';
    document.getElementById('form-title').textContent = '➕ Agregar Pregunta';
    document.getElementById('btn-cancel-edit').style.display = 'none';
    document.getElementById('form-error').textContent = '';
}

document.getElementById('btn-cancel-edit').addEventListener('click', resetForm);

// ——— Escuchar preguntas en tiempo real ———
onValue(ref(db, 'question-bank'), (snap) => {
    const data = snap.val();
    const questions = data ? Object.entries(data).map(([id, q]) => ({ id, ...q })) : [];
    document.getElementById('q-count').textContent = questions.length;
    renderList(questions);
});

// ——— Renderizar lista ———
function renderList(questions) {
    const container = document.getElementById('q-list');
    if (!questions.length) {
        container.innerHTML = '<div class="admin-empty">No hay preguntas. Agrega una arriba o carga las preguntas por defecto.</div>';
        return;
    }
    container.innerHTML = questions.map((q, i) => `
        <div class="q-item">
            <div class="q-item-body">
                <div class="q-item-cat">${escHtml(q.category || 'Sin categoría')} · #${i + 1}</div>
                <div class="q-item-text">${escHtml(q.question)}</div>
                <div class="q-item-opts">
                    ${(q.options || []).map((o, oi) =>
                        `<span style="${oi === q.correct ? 'color:#00FF94;font-weight:900' : ''}">${['A','B','C','D'][oi]}) ${escHtml(o)}</span>`
                    ).join('  ·  ')}
                </div>
            </div>
            <div class="q-item-actions">
                <button class="btn-icon" onclick="editQuestion('${escAttr(q.id)}')">✏️</button>
                <button class="btn-icon del" onclick="deleteQuestion('${escAttr(q.id)}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ——— Editar pregunta ———
window.editQuestion = async function(id) {
    const snap = await get(ref(db, `question-bank/${id}`));
    if (!snap.exists()) return;
    const q = snap.val();
    document.getElementById('f-category').value = q.category || '';
    document.getElementById('f-question').value  = q.question || '';
    (q.options || []).forEach((o, i) => {
        const el = document.getElementById(`f-opt${i}`);
        if (el) el.value = o;
    });
    document.querySelectorAll('.correct-opt').forEach(b => b.classList.remove('active'));
    const activeOpt = document.querySelector(`.correct-opt[data-val="${q.correct}"]`);
    if (activeOpt) activeOpt.classList.add('active');
    selectedCorrect = q.correct;
    editingId = id;
    document.getElementById('edit-id').value = id;
    document.getElementById('form-title').textContent = '✏️ Editar Pregunta';
    document.getElementById('btn-cancel-edit').style.display = 'inline-flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ——— Eliminar pregunta ———
window.deleteQuestion = async function(id) {
    if (!confirm('¿Eliminar esta pregunta?')) return;
    try {
        await remove(ref(db, `question-bank/${id}`));
    } catch (err) {
        alert('Error: ' + err.message);
    }
};

// ——— Cargar preguntas por defecto ———
document.getElementById('btn-load-defaults').addEventListener('click', async () => {
    if (!confirm(`¿Cargar ${ALL_QUESTIONS.length} preguntas por defecto? Se agregarán a las existentes.`)) return;
    try {
        for (const q of ALL_QUESTIONS) {
            await push(ref(db, 'question-bank'), q);
        }
        alert(`✅ ${ALL_QUESTIONS.length} preguntas cargadas exitosamente.`);
    } catch (err) {
        alert('Error: ' + err.message);
    }
});

// ——— Borrar todas ———
document.getElementById('btn-clear-all').addEventListener('click', async () => {
    if (!confirm('¿Borrar TODAS las preguntas del banco? Esta acción no se puede deshacer.')) return;
    try {
        await remove(ref(db, 'question-bank'));
    } catch (err) {
        alert('Error: ' + err.message);
    }
});

// ——— Utilidades ———
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escAttr(str) {
    return String(str).replace(/'/g, "\\'");
}

} // fin initAdmin()
