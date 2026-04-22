export const outputPath = 'nginx/nginx.conf';

function proxyHeaders(indent) {
  return [
    `${indent}proxy_set_header Host $host;`,
    `${indent}proxy_set_header X-Real-IP $remote_addr;`,
    `${indent}proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `${indent}proxy_set_header X-Forwarded-Proto $scheme;`,
  ].join('\n');
}

function authBlock(indent) {
  return [
    `${indent}location = /_auth {`,
    `${indent}    internal;`,
    `${indent}    proxy_pass http://auth-service:3000/verify;`,
    `${indent}    proxy_pass_request_body off;`,
    `${indent}    proxy_set_header Content-Length "";`,
    `${indent}    proxy_set_header X-Forwarded-Proto $scheme;`,
    `${indent}    proxy_set_header X-Forwarded-Host $host;`,
    `${indent}    proxy_set_header X-Forwarded-Uri $request_uri;`,
    `${indent}    proxy_set_header X-Real-IP $remote_addr;`,
    `${indent}    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`,
    `${indent}    proxy_set_header Cookie $http_cookie;`,
    `${indent}}`,
  ].join('\n');
}

function serverBlock(site, authDomain, isProtected) {
  const lines = [
    `    server {`,
    `        listen 80;`,
    `        server_name ${site.domain};`,
    '',
  ];

  if (isProtected) {
    lines.push(authBlock('        '), '');
    lines.push(
      `        location @login_redirect {`,
      `            return 302 https://${authDomain}/login?redirect=$scheme://$host$request_uri;`,
      `        }`,
      '',
    );
  }

  lines.push(`        location / {`);
  if (isProtected) {
    lines.push(
      `            auth_request /_auth;`,
      `            auth_request_set $auth_user $upstream_http_x_auth_user;`,
      `            proxy_set_header X-Auth-User $auth_user;`,
      `            error_page 401 = @login_redirect;`,
    );
  }
  lines.push(proxyHeaders('            '));
  lines.push(`            proxy_pass http://${site.upstream};`);
  lines.push(`        }`);
  lines.push(`    }`);

  return lines.join('\n');
}

export function generate(config) {
  const blocks = [
    'events {',
    '    worker_connections 1024;',
    '}',
    '',
    'http {',
    `    server {`,
    `        listen 80;`,
    `        server_name ${config.auth_domain};`,
    '',
    `        location / {`,
    proxyHeaders('            '),
    `            proxy_pass http://auth-service:3000;`,
    `        }`,
    `    }`,
    '',
  ];

  for (const site of config.sites) {
    blocks.push(serverBlock(site, config.auth_domain, site.protected), '');
  }

  blocks.push('}', '');
  return blocks.join('\n');
}

export function proxyService() {
  return {
    image: 'nginx:alpine',
    restart: 'unless-stopped',
    ports: ['80:80', '443:443'],
    volumes: ['./nginx/nginx.conf:/etc/nginx/nginx.conf:ro'],
    networks: ['web'],
    depends_on: ['auth-service'],
  };
}

export function extraVolumes() {
  return {};
}
