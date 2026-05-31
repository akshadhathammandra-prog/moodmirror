/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'block-navy': '#0A3323',
        'block-sage': '#839958',
        'block-pink': '#D3968C',
        'block-blue': '#105666',
        'block-yellow': '#F7F4D5',
        'block-bg': '#F7F4D5',
        'block-text': '#0A3323',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
