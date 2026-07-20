import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { warlordsApi } from './server/dev-plugin.ts';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit(), warlordsApi()],
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
});
