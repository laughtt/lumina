import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = "http://localhost:8787";
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "react-native": "react-native-web" },
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".js"],
  },
  define: { global: "globalThis", __DEV__: "false" },
  server: { port: 5173, proxy: { "/api": api, "/mcp": api, "/media": api } },
});
