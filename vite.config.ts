import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';
import localConfig from './wrangler.development.json' with { type: 'json' };
import testConfig from './wrangler.test.json' with { type: 'json' };
const environment = process.env.CRM_ENV || 'development';
if (!['development', 'test'].includes(environment))
  throw new Error(
    'Production is intentionally disabled. Configure a separate deployment, database and authentication first.',
  );
const config = environment === 'test' ? testConfig : localConfig;

const localBindingConfig = {
  ...config,
  main: 'vinext/server/fetch-handler',
  vars: { CRM_ENV: environment },
};
export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      host: '127.0.0.1',
      port: environment === 'test' ? 4318 : 4317,
      strictPort: true,
    },
    plugins: [
      vinext(),
      cloudflare({
        inspectorPort: false,
        persistState: { path: '.local/' + environment },
        remoteBindings: false,
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
