import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { generate as generateCompose } from '../generators/compose.js';

const GENERATORS = {
  caddy: () => import('../generators/caddy.js'),
  nginx: () => import('../generators/nginx.js'),
  traefik: () => import('../generators/traefik.js'),
};

export async function generateAll(configPath = 'gatehouse.json') {
  const fullPath = resolve(configPath);
  const config = JSON.parse(readFileSync(fullPath, 'utf8'));
  const loader = GENERATORS[config.proxy];

  if (!loader) {
    console.error(`Unknown proxy: ${config.proxy}`);
    process.exit(1);
  }

  const gen = await loader();

  const proxyConfig = gen.generate(config);
  const outPath = resolve(gen.outputPath);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, proxyConfig);
  console.log(`  ${gen.outputPath}`);

  if (config.proxy === 'traefik' && gen.generateStaticConfig) {
    const staticPath = resolve('traefik/traefik.yml');
    writeFileSync(staticPath, gen.generateStaticConfig());
    console.log('  traefik/traefik.yml');
  }

  const compose = generateCompose(config.proxy, gen.proxyService(), gen.extraVolumes());
  writeFileSync(resolve('docker-compose.yml'), compose);
  console.log('  docker-compose.yml');
}
