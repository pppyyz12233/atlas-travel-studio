/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"',
          '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif',
        ],
        mono: ['"SF Mono"', '"JetBrains Mono"', '"Cascadia Code"', 'monospace'],
      },
      colors: {
        glass: {
          bg: 'rgba(255,255,255,0.72)',
          border: 'rgba(255,255,255,0.5)',
          sidebar: 'rgba(250,250,252,0.78)',
        },
        apple: {
          blue: '#0071e3',
          'blue-hover': '#0077ed',
          green: '#34c759',
          red: '#ff3b30',
          amber: '#ff9500',
          purple: '#af52de',
        },
      },
      backdropBlur: {
        glass: '24px',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'ease-in-out-quint': 'cubic-bezier(0.77, 0, 0.175, 1)',
        'ease-drawer': 'cubic-bezier(0.32, 0.72, 0, 1)',
        'spring': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out-expo',
        'slide-up': 'slideUp 0.3s ease-drawer',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
