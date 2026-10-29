import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        "brand-green": {
          DEFAULT: "#12372A",
          50:  "#e8f0ec",
          100: "#c5d8cc",
          200: "#9ebfab",
          300: "#77a68a",
          400: "#559370",
          500: "#3a7f5a",
          600: "#2d6b4a",
          700: "#1f573a",
          800: "#12372A",
          900: "#0a2019",
        },
        "brand-gold": {
          DEFAULT: "#D6B875",
          50:  "#fdf8ee",
          100: "#f9edcf",
          200: "#f3dda0",
          300: "#ecc96c",
          400: "#D6B875",
          500: "#c9a44d",
          600: "#b08833",
          700: "#8d6a27",
          800: "#6e5120",
          900: "#503c19",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in":       "fadeIn 0.3s ease-in-out",
        "slide-up":      "slideUp 0.3s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)",    opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
