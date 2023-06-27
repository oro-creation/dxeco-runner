import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          cli: './src/cli.ts',
        },
        output: {
          entryFileNames: '[name].js',
          manualChunks: undefined,
        },
      },
    },
  };
});
