import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves the app from /dealsense/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/dealsense/',
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1600 },
})
