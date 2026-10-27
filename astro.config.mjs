// @ts-check
import { defineConfig } from 'astro/config';
import { loadEnv } from 'vite';

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

const { PUBLIC_SITE_URL } = loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), '');

// https://astro.build/config
export default defineConfig({
  site: PUBLIC_SITE_URL || undefined,
  integrations: [mdx(), ...(PUBLIC_SITE_URL ? [sitemap()] : [])]
});
