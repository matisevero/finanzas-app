import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:  ['var(--font-syne)', 'system-ui', 'sans-serif'],
        mono:  ['var(--font-space-mono)', 'monospace'],
        serif: ['var(--font-dm-serif)', 'serif'],
      },
      colors: {
        brand: {
          50:  '#f0fdf9',
          100: '#ccfbef',
          500: '#00d4aa',
          600: '#00b896',
          700: '#0e9f85',
        },
      },
      boxShadow: {
        card:       '0 1px 3px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)',
        'card-hover':'0 4px 16px rgba(0,0,0,0.08)',
        modal:      '0 20px 60px rgba(0,0,0,0.15)',
      },
    },
  },
  plugins: [],
}
export default config
