/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm street-poster blacks — same keys, warmer hues
        ink: {
          950: '#0a0806',
          900: '#100d09',
          850: '#171310',
          800: '#1f1a13',
          700: '#2d271b',
          600: '#453c28',
          500: '#6b5f42',
          400: '#8a7d58',
          300: '#b3a67f',
          200: '#d6cba9',
          100: '#ece4cc',
        },
        // Paper cream for sticker fills + display text
        paper: {
          DEFAULT: '#f3ebd6',
          dim: '#cfc39e',
        },
        // Nigerian green — deepened flag green
        naija: {
          50: '#ecfdf1',
          100: '#d1f7dd',
          200: '#a7efc0',
          300: '#7bdda0',
          400: '#2fbf71',
          500: '#0e9e5b',
          600: '#0b7a46',
          700: '#095c37',
          800: '#0a4a2e',
          900: '#073b25',
        },
        // Pepper red-orange
        pepper: {
          300: '#f69a6b',
          400: '#f0703c',
          500: '#de4e1f',
          600: '#b93a12',
        },
        gold: {
          300: '#ffd970',
          400: '#ffc42e',
          500: '#e9a800',
        },
        live: '#e23a2e',
      },
      fontFamily: {
        display: ['"Archivo Black"', '"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        hard: '4px 4px 0 0 #000',
        'hard-sm': '2px 2px 0 0 #000',
        'hard-cream': '4px 4px 0 0 rgba(243,235,214,0.16)',
      },
      keyframes: {
        'pulse-live': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'pulse-live': 'pulse-live 1.4s ease-in-out infinite',
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        marquee: 'marquee 28s linear infinite',
      },
    },
  },
  plugins: [],
};
