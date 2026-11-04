/** Misma configuración que tenía el CDN en index.html. */
export default {
  darkMode: 'class',
  content: ['./public/index.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        hull: '#0a0f1a',
        panel: '#111827',
        panel2: '#0d1526',
      },
    },
  },
}
