import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0F1B14",
        bgalt: "#16241C",
        panel: "#182B20",
        line: "#26392C",
        card: "#F5F0E6",
        ink: "#1B1B1B",
        gold: "#D4A039",
        goldbright: "#F0C05A",
        red: "#B33B3B",
        teal: "#3E8E7E",
        text: "#EDE6D6",
        dim: "#9BA89C",
      },
      fontFamily: {
        display: ["'Bebas Neue'", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
