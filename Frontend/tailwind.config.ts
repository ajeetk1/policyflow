import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#10121a",
        panel: "#1b1d27",
        accent: "#27c793",
      },
    },
  },
  plugins: [],
};

export default config;
