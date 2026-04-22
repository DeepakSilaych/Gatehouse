import { writeFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { resolve } from 'path';
import { askProxy, askDomain, askSite, askAddMore } from './prompts.js';
import { generateAll } from './generate.js';

export async function init() {
  console.log('\n  Gatehouse - Auth Gateway Setup\n');

  const proxy = await askProxy();
  const authDomain = await askDomain('Auth service domain:', 'auth.example.com');
  const cookieDomain = await askDomain('Cookie domain (parent of all subdomains):', `.${authDomain.split('.').slice(1).join('.')}`);
  const sessionHours = parseInt(
    await askDomain('Session duration (hours):', '168'),
    10,
  );

  const sites = [];
  let addMore = true;
  while (addMore) {
    console.log('');
    sites.push(await askSite());
    addMore = await askAddMore();
  }

  const config = {
    proxy,
    auth_domain: authDomain,
    cookie_domain: cookieDomain,
    session_hours: sessionHours,
    sites,
  };

  writeFileSync(resolve('gatehouse.json'), JSON.stringify(config, null, 2) + '\n');
  console.log('\n  Generated:');
  console.log('  gatehouse.json');

  const secret = randomBytes(32).toString('hex');
  const envContent = [
    `AUTH_DOMAIN=${authDomain}`,
    `COOKIE_DOMAIN=${cookieDomain}`,
    `JWT_SECRET=${secret}`,
    `SESSION_HOURS=${sessionHours}`,
    'DB_PATH=/data/auth.db',
    'NODE_ENV=production',
    '',
  ].join('\n');

  writeFileSync(resolve('.env'), envContent);
  console.log('  .env');

  await generateAll();

  console.log(`
  Next steps:
    1. docker compose up -d
    2. docker compose exec auth-service node src/cli.js add <username> <password>
    3. Point your DNS records to this server
  `);
}
