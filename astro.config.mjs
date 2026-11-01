import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  site: process.env.SITE_URL || process.env.PUBLIC_SITE_URL || 'https://luxury-realty-imon.vercel.app',
  output: 'static',
  devToolbar: {enabled:false},
  adapter: vercel(),
  trailingSlash: 'always',
  server: { port: 4312 },
  build: { format: 'directory' },
});
