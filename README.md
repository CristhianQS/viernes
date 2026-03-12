# ⛰️ Sube la Montaña — Quiz Interactivo

Juego de preguntas y respuestas multijugador en tiempo real.
Los jugadores eligen un personaje y suben una montaña respondiendo preguntas correctamente.

---

## 🚀 Configuración paso a paso

### 1. Firebase (base de datos en tiempo real)

1. Ve a https://console.firebase.google.com/
2. **Crea un nuevo proyecto** (ej. `sube-la-montana`)
3. En el menú lateral: **Build → Realtime Database**
   - "Create Database" → elige región → **"Start in test mode"**
4. Ve a ⚙️ **Configuración del proyecto → General → Your apps → `</>`**
   - Registra la app y copia el objeto `firebaseConfig`
5. Pega los valores en `js/config.js` reemplazando los campos `"TU_..."`:

```js
const firebaseConfig = {
    apiKey:            "tu-api-key-real",
    authDomain:        "tu-proyecto.firebaseapp.com",
    databaseURL:       "https://tu-proyecto-default-rtdb.firebaseio.com/",
    projectId:         "tu-proyecto",
    storageBucket:     "tu-proyecto.appspot.com",
    messagingSenderId: "123456789",
    appId:             "1:123456789:web:abcdef"
};
```

### 2. Publicar en GitHub Pages

```bash
git add .
git commit -m "Add mountain quiz game"
git push origin main
```

Luego en GitHub: **Settings → Pages → Branch: main / (root) → Save**

Tu juego estará en: `https://TU_USUARIO.github.io/NOMBRE_REPO/`

---

## 📁 Estructura

```
viernes/
├── index.html          ← Toda la UI del juego
├── css/styles.css      ← Estilos tema oscuro montaña
├── js/
│   ├── config.js       ← ⚠️  Tu configuración Firebase
│   ├── questions.js    ← Banco de preguntas (editable)
│   └── game.js         ← Lógica completa del juego
├── .nojekyll           ← Necesario para GitHub Pages
└── README.md
```

## ✏️ Agregar preguntas

Edita `js/questions.js`:

```js
{
    category: "🌍 Geografía",
    question: "¿Cuál es la capital de Francia?",
    options: ["Londres", "París", "Madrid", "Roma"],
    correct: 1   // índice 0-3
}
```

## 🎮 Características

- 6 personajes para elegir (🧗🦊🐧🐉🐻🦅)
- 25 preguntas mezcladas aleatoriamente
- Timer de 15 segundos + puntos extra por velocidad
- Multijugador en tiempo real (Firebase)
- Personajes animados subiendo la montaña
- Ranking en vivo + tabla final
- Funciona en móvil y escritorio