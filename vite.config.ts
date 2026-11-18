import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves the app from /dealsense/; Vercel serves it from the root
export default defineConfig({
  base: process.env.VITE_BASE ?? (process.env.VERCEL ? '/' : '/dealsense/'),
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1600 },
})
