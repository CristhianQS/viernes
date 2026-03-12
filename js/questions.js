// ================================================================
//  BANCO DE PREGUNTAS
//  Puedes agregar, editar o quitar preguntas libremente.
//  Formato: { category, question, options: [A,B,C,D], correct: índice }
// ================================================================

export const ALL_QUESTIONS = [
    // --- Geografía ---
    {
        category: "🌍 Geografía",
        question: "¿Cuál es la montaña más alta del mundo?",
        options: ["K2", "Monte Everest", "Aconcagua", "Mont Blanc"],
        correct: 1
    },
    {
        category: "🌍 Geografía",
        question: "¿Cuál es el río más largo del mundo?",
        options: ["Amazonas", "Nilo", "Misisipi", "Yangtsé"],
        correct: 1
    },
    {
        category: "🌍 Geografía",
        question: "¿En qué continente se encuentra el Sahara?",
        options: ["Asia", "América", "África", "Australia"],
        correct: 2
    },
    {
        category: "🌍 Geografía",
        question: "¿Cuál es el océano más grande del mundo?",
        options: ["Atlántico", "Índico", "Ártico", "Pacífico"],
        correct: 3
    },
    {
        category: "🌍 Geografía",
        question: "¿Cuál es el país más grande del mundo por superficie?",
        options: ["China", "Canadá", "Rusia", "Estados Unidos"],
        correct: 2
    },

    // --- Ciencia ---
    {
        category: "🔬 Ciencia",
        question: "¿Cuántos planetas tiene nuestro sistema solar?",
        options: ["7", "8", "9", "10"],
        correct: 1
    },
    {
        category: "🔬 Ciencia",
        question: "¿Cuál es el elemento más abundante en el universo?",
        options: ["Oxígeno", "Carbono", "Hidrógeno", "Helio"],
        correct: 2
    },
    {
        category: "🔬 Ciencia",
        question: "¿A qué velocidad viaja la luz en el vacío (aprox.)?",
        options: ["300 000 km/s", "150 000 km/s", "500 000 km/s", "100 000 km/s"],
        correct: 0
    },
    {
        category: "🔬 Ciencia",
        question: "¿Qué gas producen las plantas en la fotosíntesis?",
        options: ["CO₂", "Nitrógeno", "Oxígeno", "Hidrógeno"],
        correct: 2
    },
    {
        category: "🔬 Ciencia",
        question: "¿Cuántos huesos tiene el cuerpo humano adulto?",
        options: ["206", "215", "198", "230"],
        correct: 0
    },

    // --- Historia ---
    {
        category: "📜 Historia",
        question: "¿En qué año llegó Cristóbal Colón a América?",
        options: ["1488", "1500", "1492", "1510"],
        correct: 2
    },
    {
        category: "📜 Historia",
        question: "¿Qué civilización construyó las pirámides de Giza?",
        options: ["Griegos", "Romanos", "Mayas", "Egipcios"],
        correct: 3
    },
    {
        category: "📜 Historia",
        question: "¿Cuándo comenzó la Primera Guerra Mundial?",
        options: ["1912", "1914", "1916", "1918"],
        correct: 1
    },
    {
        category: "📜 Historia",
        question: "¿Quién fue el primer hombre en pisar la Luna?",
        options: ["Yuri Gagarin", "Buzz Aldrin", "Neil Armstrong", "John Glenn"],
        correct: 2
    },
    {
        category: "📜 Historia",
        question: "¿Dónde se firmó la Declaración de Independencia de EE.UU.?",
        options: ["Nueva York", "Boston", "Washington D.C.", "Filadelfia"],
        correct: 3
    },

    // --- Cultura / Arte ---
    {
        category: "🎨 Arte y Cultura",
        question: "¿Quién pintó la Mona Lisa?",
        options: ["Miguel Ángel", "Leonardo da Vinci", "Rafael", "Botticelli"],
        correct: 1
    },
    {
        category: "🎨 Arte y Cultura",
        question: "¿En qué país nació Mozart?",
        options: ["Alemania", "Austria", "Italia", "Francia"],
        correct: 1
    },
    {
        category: "🎨 Arte y Cultura",
        question: "¿Quién escribió 'Cien años de soledad'?",
        options: ["Pablo Neruda", "Jorge Luis Borges", "Gabriel García Márquez", "Mario Vargas Llosa"],
        correct: 2
    },

    // --- Tecnología ---
    {
        category: "💻 Tecnología",
        question: "¿En qué año se lanzó el primer iPhone?",
        options: ["2005", "2006", "2007", "2008"],
        correct: 2
    },
    {
        category: "💻 Tecnología",
        question: "¿Qué significa 'HTML'?",
        options: [
            "Hyper Text Markup Language",
            "High Technology Modern Language",
            "Hyper Transfer Mode Logic",
            "Home Tool Markup Language"
        ],
        correct: 0
    },

    // --- Deportes ---
    {
        category: "⚽ Deportes",
        question: "¿Cuántos jugadores hay en un equipo de fútbol?",
        options: ["9", "10", "11", "12"],
        correct: 2
    },
    {
        category: "⚽ Deportes",
        question: "¿En qué país se originó el deporte del béisbol?",
        options: ["Cuba", "Canadá", "Estados Unidos", "México"],
        correct: 2
    },

    // --- Naturaleza ---
    {
        category: "🌿 Naturaleza",
        question: "¿Cuál es el animal terrestre más rápido?",
        options: ["León", "Guepardo", "Antílope", "Caballo"],
        correct: 1
    },
    {
        category: "🌿 Naturaleza",
        question: "¿Cuántos años puede vivir una tortuga gigante?",
        options: ["50 años", "80 años", "100 años", "más de 150 años"],
        correct: 3
    },
    {
        category: "🌿 Naturaleza",
        question: "¿Qué tipo de animal es la ballena azul?",
        options: ["Pez", "Tiburón", "Mamífero", "Reptil"],
        correct: 2
    }
];

// Obtener N preguntas aleatorias sin repetir
export function getRandomQuestions(n = 10) {
    const shuffled = [...ALL_QUESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
}
