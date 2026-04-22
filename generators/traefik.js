export const outputPath = 'traefik/dynamic.yml';

function indent(level, text) {
  return `${'  '.repeat(level)}${text}`;
}

export function generate(config) {
  const lines = [
    'http:',
    '  middlewares:',
    '    gatehouse-auth:',
    '      forwardAuth:',
    `        address: "http://auth-service:3000/verify?rd=${config.auth_domain}"`,
    '        authResponseHeaders:',
    '          - "X-Auth-User"',
    '        trustForwardHeader: true',
    '',
    '  routers:',
    '    auth:',
    `      rule: "Host(\`${config.auth_domain}\`)"`,
    '      service: auth-svc',
    '      entryPoints:',
    '        - web',
  ];

  for (const site of config.sites) {
    const name = site.domain.split('.')[0];
    lines.push(
      `    ${name}:`,
      `      rule: "Host(\`${site.domain}\`)"`,
      `      service: ${name}-svc`,
    );
    if (site.protected) {
      lines.push(
        '      middlewares:',
        '        - gatehouse-auth',
      );
    }
    lines.push('      entryPoints:', '        - web');
  }

  lines.push(
    '',
    '  services:',
    '    auth-svc:',
    '      loadBalancer:',
    '        servers:',
    '          - url: "http://auth-service:3000"',
  );

  for (const site of config.sites) {
    const name = site.domain.split('.')[0];
    lines.push(
      `    ${name}-svc:`,
      '      loadBalancer:',
      '        servers:',
      `          - url: "http://${site.upstream}"`,
    );
  }

  lines.push('');
  return lines.join('\n');
}

export function generateStaticConfig() {
  return [
    'entryPoints:',
    '  web:',
    '    address: ":80"',
    '  websecure:',
    '    address: ":443"',
    '',
    'providers:',
    '  file:',
    '    filename: /etc/traefik/dynamic.yml',
    '',
    'api:',
    '  dashboard: false',
    '',
  ].join('\n');
}

export function proxyService() {
  return {
    image: 'traefik:v3.0',
    restart: 'unless-stopped',
    ports: ['80:80', '443:443'],
    volumes: [
      './traefik/traefik.yml:/etc/traefik/traefik.yml:ro',
      './traefik/dynamic.yml:/etc/traefik/dynamic.yml:ro',
    ],
    networks: ['web'],
    depends_on: ['auth-service'],
  };
}

export function extraVolumes() {
  return {};
}
