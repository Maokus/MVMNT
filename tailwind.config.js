/** @type {import('tailwindcss').Config} */
export default {
    content: ['./index.html', './src/**/*.{ts,tsx,js,jsx,html}'],
    theme: {
        extend: {
            colors: {
                background: '#1e1e1e',
                panel: '#252526',
                menubar: '#2d2d30',
                border: '#3e3e42',
                control: '#3c3c3c',
                control2: '#464647',
                accent: '#0e639c',
            },
            fontFamily: {
                sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
                mono: ['SF Mono', 'Monaco', 'Cascadia Code', 'monospace'],
            },
        },
    },
    plugins: [],
};
