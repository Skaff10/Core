/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#121212",
        surface: "#1E1E1E",
        elevated: "#252525",
        hairline: "#2A2A2A",
        borderStrong: "#3A3A3A",
        ink: "#E2E8F0",
        muted: "#94A3B8",
        subtle: "#64748B",
        cyan: "#06B6D4",
        emerald: "#10B981",
        amber: "#F59E0B",
        crimson: "#EF4444",
      },
    },
  },
  plugins: [],
};

