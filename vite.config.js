import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'build',
    },
    base: './',
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    }
});