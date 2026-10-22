import { handle } from "hono/aws-lambda";
import { app } from "./app.js";
import { tick } from "./jobs.js";

const http = handle(app);
export const handler = async (event: any, context: any) => (event?.job === "tick" ? tick() : http(event, context));
