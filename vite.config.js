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
          solana: ['@solana/web3.js'],
          wallet: [
            '@wallet-standard/app',
            '@wallet-standard/base',
            '@wallet-standard/features',
            '@solana/wallet-standard-features',
            '@solana/wallet-standard-util',
          ],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'three',
      'three/examples/jsm/objects/Water.js',
      'three/examples/jsm/objects/Sky.js',
      '@solana/web3.js',
      '@wallet-standard/app',
      '@solana/wallet-standard-features',
    ],
  },
});
