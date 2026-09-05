/** @type {import('tailwindcss').Config} */
//
// Цвета заданы переменными CSS (см. src/index.css): один и тот же класс
// `bg-slate-850` даёт тёмную подложку в тёмной теме и светлую в светлой.
// Так тема переключается целиком, без правки классов в двадцати шести файлах.
//
// Размеры шрифта заданы вместе с межстрочным и межбуквенным расстоянием:
// крупный текст набирается плотнее, мелкий — свободнее (правило типографики
// Apple: трекинг зависит от кегля, интерлиньяж меняется обратно размеру).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        slate: { 50: 'rgb(var(--c-slate-50) / <alpha-value>)', 100: 'rgb(var(--c-slate-100) / <alpha-value>)', 200: 'rgb(var(--c-slate-200) / <alpha-value>)', 300: 'rgb(var(--c-slate-300) / <alpha-value>)', 400: 'rgb(var(--c-slate-400) / <alpha-value>)', 500: 'rgb(var(--c-slate-500) / <alpha-value>)', 600: 'rgb(var(--c-slate-600) / <alpha-value>)', 700: 'rgb(var(--c-slate-700) / <alpha-value>)', 750: 'rgb(var(--c-slate-750) / <alpha-value>)', 800: 'rgb(var(--c-slate-800) / <alpha-value>)', 850: 'rgb(var(--c-slate-850) / <alpha-value>)', 900: 'rgb(var(--c-slate-900) / <alpha-value>)', 925: 'rgb(var(--c-slate-925) / <alpha-value>)', 950: 'rgb(var(--c-slate-950) / <alpha-value>)' },
        brand: { 50: 'rgb(var(--c-brand-50) / <alpha-value>)', 100: 'rgb(var(--c-brand-100) / <alpha-value>)', 200: 'rgb(var(--c-brand-200) / <alpha-value>)', 300: 'rgb(var(--c-brand-300) / <alpha-value>)', 400: 'rgb(var(--c-brand-400) / <alpha-value>)', 500: 'rgb(var(--c-brand-500) / <alpha-value>)', 600: 'rgb(var(--c-brand-600) / <alpha-value>)', 700: 'rgb(var(--c-brand-700) / <alpha-value>)', 800: 'rgb(var(--c-brand-800) / <alpha-value>)', 900: 'rgb(var(--c-brand-900) / <alpha-value>)', 950: 'rgb(var(--c-brand-950) / <alpha-value>)' },
        mint: { 50: 'rgb(var(--c-mint-50) / <alpha-value>)', 100: 'rgb(var(--c-mint-100) / <alpha-value>)', 200: 'rgb(var(--c-mint-200) / <alpha-value>)', 300: 'rgb(var(--c-mint-300) / <alpha-value>)', 400: 'rgb(var(--c-mint-400) / <alpha-value>)', 500: 'rgb(var(--c-mint-500) / <alpha-value>)', 600: 'rgb(var(--c-mint-600) / <alpha-value>)', 700: 'rgb(var(--c-mint-700) / <alpha-value>)', 800: 'rgb(var(--c-mint-800) / <alpha-value>)', 900: 'rgb(var(--c-mint-900) / <alpha-value>)' },
        green: { 50: 'rgb(var(--c-green-50) / <alpha-value>)', 100: 'rgb(var(--c-green-100) / <alpha-value>)', 200: 'rgb(var(--c-green-200) / <alpha-value>)', 300: 'rgb(var(--c-green-300) / <alpha-value>)', 400: 'rgb(var(--c-green-400) / <alpha-value>)', 500: 'rgb(var(--c-green-500) / <alpha-value>)', 600: 'rgb(var(--c-green-600) / <alpha-value>)', 700: 'rgb(var(--c-green-700) / <alpha-value>)', 800: 'rgb(var(--c-green-800) / <alpha-value>)', 900: 'rgb(var(--c-green-900) / <alpha-value>)', 950: 'rgb(var(--c-green-950) / <alpha-value>)' },
        red: { 50: 'rgb(var(--c-red-50) / <alpha-value>)', 100: 'rgb(var(--c-red-100) / <alpha-value>)', 200: 'rgb(var(--c-red-200) / <alpha-value>)', 300: 'rgb(var(--c-red-300) / <alpha-value>)', 400: 'rgb(var(--c-red-400) / <alpha-value>)', 500: 'rgb(var(--c-red-500) / <alpha-value>)', 600: 'rgb(var(--c-red-600) / <alpha-value>)', 700: 'rgb(var(--c-red-700) / <alpha-value>)', 800: 'rgb(var(--c-red-800) / <alpha-value>)', 900: 'rgb(var(--c-red-900) / <alpha-value>)', 950: 'rgb(var(--c-red-950) / <alpha-value>)' },
        blue: { 50: 'rgb(var(--c-blue-50) / <alpha-value>)', 100: 'rgb(var(--c-blue-100) / <alpha-value>)', 200: 'rgb(var(--c-blue-200) / <alpha-value>)', 300: 'rgb(var(--c-blue-300) / <alpha-value>)', 400: 'rgb(var(--c-blue-400) / <alpha-value>)', 500: 'rgb(var(--c-blue-500) / <alpha-value>)', 600: 'rgb(var(--c-blue-600) / <alpha-value>)', 700: 'rgb(var(--c-blue-700) / <alpha-value>)', 800: 'rgb(var(--c-blue-800) / <alpha-value>)', 900: 'rgb(var(--c-blue-900) / <alpha-value>)', 950: 'rgb(var(--c-blue-950) / <alpha-value>)' },
        yellow: { 50: 'rgb(var(--c-yellow-50) / <alpha-value>)', 100: 'rgb(var(--c-yellow-100) / <alpha-value>)', 200: 'rgb(var(--c-yellow-200) / <alpha-value>)', 300: 'rgb(var(--c-yellow-300) / <alpha-value>)', 400: 'rgb(var(--c-yellow-400) / <alpha-value>)', 500: 'rgb(var(--c-yellow-500) / <alpha-value>)', 600: 'rgb(var(--c-yellow-600) / <alpha-value>)', 700: 'rgb(var(--c-yellow-700) / <alpha-value>)', 800: 'rgb(var(--c-yellow-800) / <alpha-value>)', 900: 'rgb(var(--c-yellow-900) / <alpha-value>)', 950: 'rgb(var(--c-yellow-950) / <alpha-value>)' },
        amber: { 50: 'rgb(var(--c-amber-50) / <alpha-value>)', 100: 'rgb(var(--c-amber-100) / <alpha-value>)', 200: 'rgb(var(--c-amber-200) / <alpha-value>)', 300: 'rgb(var(--c-amber-300) / <alpha-value>)', 400: 'rgb(var(--c-amber-400) / <alpha-value>)', 500: 'rgb(var(--c-amber-500) / <alpha-value>)', 600: 'rgb(var(--c-amber-600) / <alpha-value>)', 700: 'rgb(var(--c-amber-700) / <alpha-value>)', 800: 'rgb(var(--c-amber-800) / <alpha-value>)', 900: 'rgb(var(--c-amber-900) / <alpha-value>)', 950: 'rgb(var(--c-amber-950) / <alpha-value>)' },
        purple: { 50: 'rgb(var(--c-purple-50) / <alpha-value>)', 100: 'rgb(var(--c-purple-100) / <alpha-value>)', 200: 'rgb(var(--c-purple-200) / <alpha-value>)', 300: 'rgb(var(--c-purple-300) / <alpha-value>)', 400: 'rgb(var(--c-purple-400) / <alpha-value>)', 500: 'rgb(var(--c-purple-500) / <alpha-value>)', 600: 'rgb(var(--c-purple-600) / <alpha-value>)', 700: 'rgb(var(--c-purple-700) / <alpha-value>)', 800: 'rgb(var(--c-purple-800) / <alpha-value>)', 900: 'rgb(var(--c-purple-900) / <alpha-value>)', 950: 'rgb(var(--c-purple-950) / <alpha-value>)' },
        orange: { 50: 'rgb(var(--c-orange-50) / <alpha-value>)', 100: 'rgb(var(--c-orange-100) / <alpha-value>)', 200: 'rgb(var(--c-orange-200) / <alpha-value>)', 300: 'rgb(var(--c-orange-300) / <alpha-value>)', 400: 'rgb(var(--c-orange-400) / <alpha-value>)', 500: 'rgb(var(--c-orange-500) / <alpha-value>)', 600: 'rgb(var(--c-orange-600) / <alpha-value>)', 700: 'rgb(var(--c-orange-700) / <alpha-value>)', 800: 'rgb(var(--c-orange-800) / <alpha-value>)', 900: 'rgb(var(--c-orange-900) / <alpha-value>)', 950: 'rgb(var(--c-orange-950) / <alpha-value>)' },
        rose: { 50: 'rgb(var(--c-rose-50) / <alpha-value>)', 100: 'rgb(var(--c-rose-100) / <alpha-value>)', 200: 'rgb(var(--c-rose-200) / <alpha-value>)', 300: 'rgb(var(--c-rose-300) / <alpha-value>)', 400: 'rgb(var(--c-rose-400) / <alpha-value>)', 500: 'rgb(var(--c-rose-500) / <alpha-value>)', 600: 'rgb(var(--c-rose-600) / <alpha-value>)', 700: 'rgb(var(--c-rose-700) / <alpha-value>)', 800: 'rgb(var(--c-rose-800) / <alpha-value>)', 900: 'rgb(var(--c-rose-900) / <alpha-value>)', 950: 'rgb(var(--c-rose-950) / <alpha-value>)' },
        indigo: { 50: 'rgb(var(--c-indigo-50) / <alpha-value>)', 100: 'rgb(var(--c-indigo-100) / <alpha-value>)', 200: 'rgb(var(--c-indigo-200) / <alpha-value>)', 300: 'rgb(var(--c-indigo-300) / <alpha-value>)', 400: 'rgb(var(--c-indigo-400) / <alpha-value>)', 500: 'rgb(var(--c-indigo-500) / <alpha-value>)', 600: 'rgb(var(--c-indigo-600) / <alpha-value>)', 700: 'rgb(var(--c-indigo-700) / <alpha-value>)', 800: 'rgb(var(--c-indigo-800) / <alpha-value>)', 900: 'rgb(var(--c-indigo-900) / <alpha-value>)', 950: 'rgb(var(--c-indigo-950) / <alpha-value>)' },
        cyan: { 50: 'rgb(var(--c-cyan-50) / <alpha-value>)', 100: 'rgb(var(--c-cyan-100) / <alpha-value>)', 200: 'rgb(var(--c-cyan-200) / <alpha-value>)', 300: 'rgb(var(--c-cyan-300) / <alpha-value>)', 400: 'rgb(var(--c-cyan-400) / <alpha-value>)', 500: 'rgb(var(--c-cyan-500) / <alpha-value>)', 600: 'rgb(var(--c-cyan-600) / <alpha-value>)', 700: 'rgb(var(--c-cyan-700) / <alpha-value>)', 800: 'rgb(var(--c-cyan-800) / <alpha-value>)', 900: 'rgb(var(--c-cyan-900) / <alpha-value>)', 950: 'rgb(var(--c-cyan-950) / <alpha-value>)' },
        emerald: { 50: 'rgb(var(--c-emerald-50) / <alpha-value>)', 100: 'rgb(var(--c-emerald-100) / <alpha-value>)', 200: 'rgb(var(--c-emerald-200) / <alpha-value>)', 300: 'rgb(var(--c-emerald-300) / <alpha-value>)', 400: 'rgb(var(--c-emerald-400) / <alpha-value>)', 500: 'rgb(var(--c-emerald-500) / <alpha-value>)', 600: 'rgb(var(--c-emerald-600) / <alpha-value>)', 700: 'rgb(var(--c-emerald-700) / <alpha-value>)', 800: 'rgb(var(--c-emerald-800) / <alpha-value>)', 900: 'rgb(var(--c-emerald-900) / <alpha-value>)', 950: 'rgb(var(--c-emerald-950) / <alpha-value>)' },
        violet: { 50: 'rgb(var(--c-violet-50) / <alpha-value>)', 100: 'rgb(var(--c-violet-100) / <alpha-value>)', 200: 'rgb(var(--c-violet-200) / <alpha-value>)', 300: 'rgb(var(--c-violet-300) / <alpha-value>)', 400: 'rgb(var(--c-violet-400) / <alpha-value>)', 500: 'rgb(var(--c-violet-500) / <alpha-value>)', 600: 'rgb(var(--c-violet-600) / <alpha-value>)', 700: 'rgb(var(--c-violet-700) / <alpha-value>)', 800: 'rgb(var(--c-violet-800) / <alpha-value>)', 900: 'rgb(var(--c-violet-900) / <alpha-value>)', 950: 'rgb(var(--c-violet-950) / <alpha-value>)' },
        pink: { 50: 'rgb(var(--c-pink-50) / <alpha-value>)', 100: 'rgb(var(--c-pink-100) / <alpha-value>)', 200: 'rgb(var(--c-pink-200) / <alpha-value>)', 300: 'rgb(var(--c-pink-300) / <alpha-value>)', 400: 'rgb(var(--c-pink-400) / <alpha-value>)', 500: 'rgb(var(--c-pink-500) / <alpha-value>)', 600: 'rgb(var(--c-pink-600) / <alpha-value>)', 700: 'rgb(var(--c-pink-700) / <alpha-value>)', 800: 'rgb(var(--c-pink-800) / <alpha-value>)', 900: 'rgb(var(--c-pink-900) / <alpha-value>)', 950: 'rgb(var(--c-pink-950) / <alpha-value>)' },
        sky: { 50: 'rgb(var(--c-sky-50) / <alpha-value>)', 100: 'rgb(var(--c-sky-100) / <alpha-value>)', 200: 'rgb(var(--c-sky-200) / <alpha-value>)', 300: 'rgb(var(--c-sky-300) / <alpha-value>)', 400: 'rgb(var(--c-sky-400) / <alpha-value>)', 500: 'rgb(var(--c-sky-500) / <alpha-value>)', 600: 'rgb(var(--c-sky-600) / <alpha-value>)', 700: 'rgb(var(--c-sky-700) / <alpha-value>)', 800: 'rgb(var(--c-sky-800) / <alpha-value>)', 900: 'rgb(var(--c-sky-900) / <alpha-value>)', 950: 'rgb(var(--c-sky-950) / <alpha-value>)' },
        teal: { 50: 'rgb(var(--c-teal-50) / <alpha-value>)', 100: 'rgb(var(--c-teal-100) / <alpha-value>)', 200: 'rgb(var(--c-teal-200) / <alpha-value>)', 300: 'rgb(var(--c-teal-300) / <alpha-value>)', 400: 'rgb(var(--c-teal-400) / <alpha-value>)', 500: 'rgb(var(--c-teal-500) / <alpha-value>)', 600: 'rgb(var(--c-teal-600) / <alpha-value>)', 700: 'rgb(var(--c-teal-700) / <alpha-value>)', 800: 'rgb(var(--c-teal-800) / <alpha-value>)', 900: 'rgb(var(--c-teal-900) / <alpha-value>)', 950: 'rgb(var(--c-teal-950) / <alpha-value>)' },
      },
      fontFamily: {
        // Системный шрифт: на iPhone и iPad это SF Pro — интерфейс выглядит
        // родным и не ждёт загрузки веб-шрифта на медленной сети.
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'sans-serif'],
        display: ['Plus Jakarta Sans', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      // Шкала поднята ещё раз 06.09.2026: `text-sm` встречается в приложении
      // 350 раз и служит основным текстом, поэтому он равен 16 пикселям, а не
      // «мелкому» размеру. Всё, что мельче 13, из шкалы убрано.
      fontSize: {
        '2xs': ['0.8125rem', { lineHeight: '1.4',  letterSpacing: '0.006em' }],
        xs:    ['0.875rem',  { lineHeight: '1.45', letterSpacing: '0.003em' }],
        sm:    ['1rem',      { lineHeight: '1.5',  letterSpacing: '0' }],
        base:  ['1.0625rem', { lineHeight: '1.55', letterSpacing: '0' }],
        lg:    ['1.25rem',   { lineHeight: '1.35', letterSpacing: '-0.011em' }],
        xl:    ['1.5rem',    { lineHeight: '1.28', letterSpacing: '-0.016em' }],
        '2xl': ['1.8125rem', { lineHeight: '1.2',  letterSpacing: '-0.02em' }],
        '3xl': ['2.25rem',   { lineHeight: '1.14', letterSpacing: '-0.022em' }],
        '4xl': ['2.75rem',   { lineHeight: '1.08', letterSpacing: '-0.025em' }],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.125rem', '3xl': '1.5rem' },
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow) / 0.06), 0 8px 24px -12px rgb(var(--shadow) / 0.18)',
        float: '0 2px 6px rgb(var(--shadow) / 0.08), 0 20px 48px -20px rgb(var(--shadow) / 0.32)',
      },
      transitionTimingFunction: { spring: 'cubic-bezier(0.32, 0.72, 0, 1)' },
      animation: {
        'fade-in': 'fadeIn 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
        'slide-up': 'slideUp 0.34s cubic-bezier(0.32, 0.72, 0, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.7' } },
      },
    },
  },
  plugins: [],
}
