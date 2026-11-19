/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1', // primary electric indigo
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        cyan: {
          400: '#38bdf8',
          500: '#06b6d4',
          600: '#0891b2',
        },
        accent: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        dark: {
          950: '#030712', // deep obsidian
          900: '#0b0f19',
          850: '#111827',
          800: '#1e293b',
        }
      },
    },
  },
  plugins: [],
}
