/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
        mono: ['"SF Mono"', '"JetBrains Mono"', '"Cascadia Code"', 'monospace'],
      },
      colors: {
        accent: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '22px',
      },
      boxShadow: {
        'glass': '0 0 0 1px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.04)',
        'glass-lg': '0 0 0 1px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04), 0 16px 48px rgba(0,0,0,0.06)',
        'card': '0 0 0 1px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02), 0 4px 12px rgba(0,0,0,0.03)',
        'card-hover': '0 0 0 1px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03), 0 8px 24px rgba(0,0,0,0.06)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      animation: {
        'in': 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
        'in-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both',
        'in-step': 'stepIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(16px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        stepIn: { '0%': { opacity: '0', transform: 'translateY(10px) scale(0.98)' }, '100%': { opacity: '1', transform: 'translateY(0) scale(1)' } },
      },
    },
  },
  plugins: [],
}
