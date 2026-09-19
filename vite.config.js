import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fittingStudioPlugin } from './dev/fittingService.js'
import { spatialStudioPlugin } from './dev/spatialService.js'

export default defineConfig({
  plugins: [react(), fittingStudioPlugin(), spatialStudioPlugin()],
  server: {
    watch: { ignored: ['**/.spatial-runtime/**', '**/.spatial-data/**'] },
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.spatial-runtime/**', '**/.spatial-data/**'] },
  },
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules/three')) return 'three'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
