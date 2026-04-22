export const outputPath = 'caddy/Caddyfile';

export function generate(config) {
  const protectedSites = config.sites.filter((s) => s.protected);
  const lines = [];

  if (protectedSites.length) {
    lines.push(
      '(protect) {',
      '\tforward_auth auth-service:3000 {',
      `\t\turi /verify?rd=https://${config.auth_domain}`,
      '\t\tcopy_headers X-Auth-User',
      '\t}',
      '}',
      '',
    );
  }

  lines.push(
    `${config.auth_domain} {`,
    '\treverse_proxy auth-service:3000',
    '}',
    '',
  );

  for (const site of config.sites) {
    lines.push(`${site.domain} {`);
    if (site.protected) lines.push('\timport protect');
    lines.push(`\treverse_proxy ${site.upstream}`);
    lines.push('}', '');
  }

  return lines.join('\n');
}

export function proxyService() {
  return {
    image: 'caddy:2-alpine',
    restart: 'unless-stopped',
    ports: ['80:80', '443:443'],
    volumes: [
      './caddy/Caddyfile:/etc/caddy/Caddyfile:ro',
      'caddy_data:/data',
      'caddy_config:/config',
    ],
    networks: ['web'],
    depends_on: ['auth-service'],
  };
}

export function extraVolumes() {
  return { caddy_data: {}, caddy_config: {} };
}
