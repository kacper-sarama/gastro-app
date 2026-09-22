/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/**/*.{html,ts,scss}"
  ],
  theme: {
    extend: {
      colors: {
        gastro: {
          dark: '#0f172a',
          surface: '#1e293b',
          card: '#1e293b',
          border: '#334155',
          text: '#f8fafc',
          muted: '#94a3b8',
          accent: '#f97316', // Ciepły pomarańcz bistro
          success: '#10b981', // Zielony - dostępny
          warning: '#f59e0b', // Pomarańczowy/bursztyn - niski stan
          danger: '#ef4444',  // Czerwony - brak
        }
      }
    },
  },
  plugins: [],
}
