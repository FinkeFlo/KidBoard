import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    // Token tests read the raw CSS source (`?raw`); by default Vitest blanks CSS modules.
    css: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
