import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Test runner for the SPA. JSDOM gives us a DOM testing-library can drive.
 *
 * Note: we deliberately omit @tailwindcss/vite from the test pipeline —
 * the CSS doesn't matter for behavioural assertions and pulling Tailwind in
 * makes the boot a noticeable amount slower.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
  },
});
