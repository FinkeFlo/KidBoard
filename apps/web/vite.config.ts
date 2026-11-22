import { readFileSync } from "node:fs";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { createPwaOptions } from "./pwa/options.ts";
import { readPwaColors } from "./pwa/tokenColors.ts";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

/** Compile-time constants (declared in `src/env.d.ts`); shared with Vitest. */
export const appDefine: Record<string, string> = {
  __APP_VERSION__: JSON.stringify(pkg.version),
};

export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA(createPwaOptions(readPwaColors()))],
  define: appDefine,
  server: { proxy: { "/api": "http://localhost:8787" } },
});
