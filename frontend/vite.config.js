import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    proxy: {
      '/candles': 'http://localhost:3000',
      '/symbols': 'http://localhost:3000',
    },
  },
});