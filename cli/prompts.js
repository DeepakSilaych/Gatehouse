import { select, input, confirm } from '@inquirer/prompts';

export async function askProxy() {
  return select({
    message: 'Select your reverse proxy',
    choices: [
      { name: 'Caddy', value: 'caddy' },
      { name: 'Nginx', value: 'nginx' },
      { name: 'Traefik', value: 'traefik' },
    ],
  });
}

export async function askDomain(message, defaultVal) {
  return input({ message, default: defaultVal, required: true });
}

export async function askSite() {
  const domain = await input({ message: 'Domain:', required: true });
  const upstream = await input({ message: 'Upstream (service:port):', required: true });
  const isProtected = await confirm({ message: 'Require authentication?', default: true });

  const site = { domain, upstream, protected: isProtected };

  if (isProtected) {
    const publicRaw = await input({
      message: 'Public paths (comma-separated, empty for none):',
      default: '',
    });
    if (publicRaw.trim()) {
      site.public_paths = publicRaw.split(',').map((p) => p.trim()).filter(Boolean);
    }

    const ipRaw = await input({
      message: 'IP whitelist (CIDR, comma-separated, empty for none):',
      default: '',
    });
    if (ipRaw.trim()) {
      site.ip_whitelist = ipRaw.split(',').map((p) => p.trim()).filter(Boolean);
    }
  }

  return site;
}

export async function askAddMore() {
  return confirm({ message: 'Add another site?', default: false });
}
