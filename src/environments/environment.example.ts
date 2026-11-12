/**
 * Szablon konfiguracji środowiska aplikacji Gastro-App.
 * 
 * Aby uruchomić aplikację z własnym projektem Firebase:
 * 1. Skopiuj ten plik jako `src/environments/environment.ts` (oraz `environment.prod.ts` dla produkcji).
 * 2. W konsoli Firebase (https://console.firebase.google.com/) utwórz projekt lub wejdź w istniejący.
 * 3. W Ustawieniach Projektu (Project Settings) -> "Twoje aplikacje" (Aplikacja sieciowa Web </>) pobierz obiekt firebaseConfig.
 * 4. Wklej wartości do poniższego obiektu `firebase`.
 */
export const environment = {
  production: false,
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
  },
  // Opcjonalny adres Cloud Functions (jeśli wdrażasz backend w katalogu /functions)
  functionsUrl: "https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net"
};

