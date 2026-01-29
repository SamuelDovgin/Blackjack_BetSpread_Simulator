import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // For GitHub Pages project sites, assets must be served from /<repo>/.
  // GitHub Actions exposes GITHUB_REPOSITORY=owner/repo, so we can auto-detect.
  base: (() => {
    if (!process.env.GITHUB_ACTIONS) return "/";
    const repo = (process.env.GITHUB_REPOSITORY ?? "").split("/")[1];
    return repo ? `/${repo}/` : "/";
  })(),
  plugins: [react()],
  server: {
    port: 5173,
  },
});
