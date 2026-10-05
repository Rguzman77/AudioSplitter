/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#111111",
          1: "#1a1a1a",
          2: "#242424",
          3: "#2e2e2e",
        },
        accent: {
          DEFAULT: "#a855f7",
          hover: "#9333ea",
        },
      },
    },
  },
  plugins: [],
};
