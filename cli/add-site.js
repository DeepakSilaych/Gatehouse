import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { askSite } from './prompts.js';
import { generateAll } from './generate.js';

export async function addSite() {
  const configPath = resolve('gatehouse.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  console.log('\n  Add a new site\n');
  const site = await askSite();

  const existing = config.sites.findIndex((s) => s.domain === site.domain);
  if (existing >= 0) {
    config.sites[existing] = site;
    console.log(`\n  Updated ${site.domain}`);
  } else {
    config.sites.push(site);
    console.log(`\n  Added ${site.domain}`);
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log('  Regenerating configs...');
  await generateAll();
  console.log('\n  Restart the proxy to apply: docker compose restart');
}
