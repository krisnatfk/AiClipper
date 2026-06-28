import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // AutoClip AI Design System Colors
        canvas: "#0E0E0E",
        sidebar: "#141414",
        card: "#1C1C1C",
        hover: "#2C2C2C",
        border: "#2C2C2C",
        primary: "#FFFFFF",
        secondary: "#A1A1A1",
        accent: "#3B82F6",
        success: "#10B981",
        alert: "#EF4444",
        energy: "#EAB308",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
