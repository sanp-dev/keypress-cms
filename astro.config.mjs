import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // Set your dashboard subdomain here
  // Example: 'https://demo-cms.quicdecode.com'
  site: 'https://demo-cms.quicdecode.com',
  integrations: [tailwind()],
  output: 'server',
  adapter: cloudflare({
    platformProxy: {
      enabled: true,
      configPath: 'wrangler.deploy.json'
    }
  }),
});