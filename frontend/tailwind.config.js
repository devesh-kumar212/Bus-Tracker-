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
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          500: '#10b981', // primary emerald
          600: '#059669',
          700: '#047857',
          900: '#064e3b',
        },
        accent: {
          400: '#2dd4bf', // teal
          500: '#14b8a6',
        },
        dark: {
          950: '#080c14',
          900: '#0f172a',
          850: '#131c2e',
        }
      },
    },
  },
  plugins: [],
}

