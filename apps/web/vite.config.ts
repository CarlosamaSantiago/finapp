import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = Number(process.env.FINAPP_PORT ?? 4317);
const webPort = Number(process.env.FINAPP_WEB_PORT ?? 5173);

// Loopback only. /api is proxied so the browser talks to a single origin and the API needs no CORS
// (docs/adr/0004-api-sessions-and-conventions.md).
const server = {
  host: '127.0.0.1',
  port: webPort,
  strictPort: true,
  proxy: { '/api': { target: `http://127.0.0.1:${String(apiPort)}`, changeOrigin: true } },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server,
  preview: server,
});
