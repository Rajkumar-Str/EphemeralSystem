/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        void: '#020101',
        ash: '#8B8B8B',
        bone: '#EAEAEA'
      },
      fontFamily: {
        sans: ['"Outfit"', 'sans-serif'],
        serif: ['"Cinzel"', 'serif'],
      }
    }
  },
  plugins: [],
}
