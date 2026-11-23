import type { Plugin } from "vite";

import type * as DemoData from "./demoData.ts";

/**
 * Dev-only Vite plugin (`pnpm dev:demo`): answers `/api/config` and `/api/agenda` with the
 * synthetic demo data for the requested day (`from`, else today), so the board can be developed without a worker,
 * secrets or a calendar. It only exists in the dev server (`apply: "serve"`), never in a build.
 *
 * The data module is loaded through the dev server (`ssrLoadModule`) because it imports the
 * TypeScript sources of `@kidboard/shared`, which Node cannot load while Vite reads its
 * config; this file itself only imports types.
 */
export function demoApiPlugin(): Plugin {
  return {
    name: "kidboard-demo-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const [path, search = ""] = (request.url ?? "").split("?");
        if (path !== "/api/config" && path !== "/api/agenda") {
          next();
          return;
        }
        server
          .ssrLoadModule("/demo/demoData.ts")
          // `ssrLoadModule` is untyped (Record<string, any>); the cast is the module's shape.
          .then((module) => {
            const demo = module as typeof DemoData;
            const now = Date.now();
            const body =
              path === "/api/config"
                ? demo.demoConfig()
                : demo.demoAgenda(
                    demo.demoAgendaStart(search, now),
                    new Date(now).toISOString(),
                  );
            response.setHeader("Content-Type", "application/json");
            response.setHeader("Cache-Control", "no-store");
            response.end(JSON.stringify(body));
          })
          .catch((error: unknown) => {
            next(error);
          });
      });
    },
  };
}
