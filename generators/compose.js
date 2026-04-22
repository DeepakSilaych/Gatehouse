function yamlValue(val, indentLevel = 0) {
  const pad = '  '.repeat(indentLevel);
  if (Array.isArray(val)) {
    return val.map((v) => `${pad}- ${typeof v === 'string' ? v : yamlValue(v, 0)}`).join('\n');
  }
  if (typeof val === 'object' && val !== null) {
    return Object.entries(val)
      .map(([k, v]) => {
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          return `${pad}${k}:\n${yamlValue(v, indentLevel + 1)}`;
        }
        if (Array.isArray(v)) {
          return `${pad}${k}:\n${yamlValue(v, indentLevel + 1)}`;
        }
        return `${pad}${k}: ${v}`;
      })
      .join('\n');
  }
  return `${val}`;
}

function serviceToYaml(name, svc, indent = 2) {
  const pad = '  '.repeat(indent);
  const lines = [`${'  '.repeat(indent - 1)}${name}:`];

  for (const [key, val] of Object.entries(svc)) {
    if (Array.isArray(val)) {
      lines.push(`${pad}${key}:`);
      val.forEach((v) => lines.push(`${pad}  - ${typeof v === 'string' ? `"${v}"` : v}`));
    } else if (typeof val === 'string') {
      lines.push(`${pad}${key}: ${val}`);
    }
  }

  return lines.join('\n');
}

export function generate(proxyName, proxySvc, extraVols) {
  const lines = ['services:'];

  lines.push(serviceToYaml(proxyName, proxySvc));
  lines.push('');

  const authSvc = {
    build: './service',
    restart: 'unless-stopped',
    env_file: '.env',
    volumes: ['auth_data:/data', './gatehouse.json:/app/gatehouse.json'],
    networks: ['web'],
  };
  lines.push(serviceToYaml('auth-service', authSvc));

  lines.push('');
  lines.push('networks:');
  lines.push('  web:');
  lines.push('    name: web');
  lines.push('    driver: bridge');

  const volumes = { auth_data: {}, ...extraVols };
  lines.push('');
  lines.push('volumes:');
  for (const vol of Object.keys(volumes)) {
    lines.push(`  ${vol}:`);
  }

  lines.push('');
  return lines.join('\n');
}
