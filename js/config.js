// ================================================================
//  CONFIGURACIÓN DE FIREBASE — SDK Modular v10
// ================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase }   from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
    apiKey:            "AIzaSyB1yUt_ut5L0HKe-KTWsscgH3ukieLK5VI",
    authDomain:        "carrera-f6267.firebaseapp.com",
    // databaseURL es obligatorio para Realtime Database.
    // Si el nombre cambia (ej. región distinta a us-central1) ajústalo aquí.
    databaseURL:       "https://carrera-f6267-default-rtdb.firebaseio.com/",
    projectId:         "carrera-f6267",
    storageBucket:     "carrera-f6267.firebasestorage.app",
    messagingSenderId: "195843698562",
    appId:             "1:195843698562:web:d212baae9de344ea16a99b"
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
