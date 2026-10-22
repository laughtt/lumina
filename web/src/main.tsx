import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { Studio } from "./Studio";
import { TvFrame } from "./TvFrame";
import { Alexa } from "./Alexa";
import { Phone } from "./Phone";
import { Share } from "./Share";
import { App } from "./app/App";
import "./styles.css";

const page = location.pathname.replace(/\/$/, "");
const views: Record<string, ReactElement> = {
  "/tv": <div className="solo solo-tv"><TvFrame /></div>,
  "/alexa": <div className="solo"><Alexa /></div>,
  "/ana": <div className="solo solo-phone"><Phone /></div>,
  "/app": <App />,
};
const share = page.match(/^\/share\/([\w-]+)$/)?.[1];
createRoot(document.getElementById("root")!).render(share ? <Share token={share} /> : views[page] ?? <Studio />);
