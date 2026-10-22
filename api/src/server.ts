import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app.js";
import { tick } from "./jobs.js";
import { seedIfEmpty } from "./seed.js";

const port = Number(process.env.PORT ?? 8787);
const web = process.env.WEB_DIST ?? "../web/dist";

await seedIfEmpty();
app.use("/*", serveStatic({ root: web }));
app.get("*", serveStatic({ path: `${web}/index.html` }));
setInterval(() => tick().catch((e) => console.error("[tick]", e.message)), 60_000);

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  const code = process.env.LUMINA_TOKEN && process.env.AUTH !== "off" ? `/?code=${process.env.LUMINA_TOKEN}` : "";
  console.log(`Lumina API on http://localhost:${port}  ·  Studio: http://localhost:${process.env.WEB_PORT ?? 5173}${code}`);
});
