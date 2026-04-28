/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fef9ee',
          100: '#fdf0d5',
          200: '#fbdea8',
          300: '#f8c671',
          400: '#f4a336',
          500: '#f18212',
          600: '#e26309',
          700: '#bc480a',
          800: '#963810',
          900: '#7a2f10',
        }
      }
    }
  },
  plugins: []
}
