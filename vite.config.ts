import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// /api/assistant -> serveur de l'assistant (8787) ; /api -> API PostGIS (8001)
const proxy = {
  "/api/assistant": { target: "http://localhost:8787", changeOrigin: true },
  "/api": { target: "http://localhost:8001", changeOrigin: true },
};
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
