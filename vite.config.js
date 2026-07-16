import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 8642,
    open: false,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/objects/Water.js',
      'three/examples/jsm/objects/Sky.js',
    ],
  },
});
