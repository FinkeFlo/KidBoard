import { APP_NAME } from "@kidboard/shared";
import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => {
  c.header("X-App-Name", APP_NAME);
  return c.json({ ok: true });
});

export default app;
