import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const CONFIG_PATH = resolve(process.env.CONFIG_PATH || '/app/gatehouse.json');

let config = { sites: [] };
let siteMap = new Map();

function load() {
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    console.warn(`Could not load config from ${CONFIG_PATH}`);
    config = { sites: [] };
  }
  siteMap = new Map(config.sites.map((s) => [s.domain, s]));
}

load();

function ipToNum(ip) {
  return ip.split('.').reduce((acc, oct) => ((acc << 8) >>> 0) + parseInt(oct, 10), 0) >>> 0;
}

function ipMatchesCidr(ip, cidr) {
  if (!cidr.includes('/')) return ip === cidr;
  const [range, bits] = cidr.split('/');
  const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1) >>> 0;
  return (ipToNum(ip) & mask) === (ipToNum(range) & mask);
}

function pathMatchesPattern(requestPath, pattern) {
  if (pattern === requestPath) return true;
  if (pattern.endsWith('/**')) {
    return requestPath.startsWith(pattern.slice(0, -2));
  }
  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -1);
    return requestPath.startsWith(prefix) && !requestPath.slice(prefix.length).includes('/');
  }
  return false;
}

function isIpWhitelisted(ip, whitelist) {
  if (!whitelist?.length || !ip) return false;
  return whitelist.some((cidr) => ipMatchesCidr(ip, cidr));
}

function isPathPublic(path, publicPaths) {
  if (!publicPaths?.length) return false;
  return publicPaths.some((pattern) => pathMatchesPattern(path, pattern));
}

export function evaluate(domain, path, clientIp) {
  const site = siteMap.get(domain);
  if (!site || !site.protected) return { requiresAuth: false };
  if (isPathPublic(path, site.public_paths)) return { requiresAuth: false };
  if (isIpWhitelisted(clientIp, site.ip_whitelist)) return { requiresAuth: false };
  return { requiresAuth: true, site };
}

export function getSites() {
  return config.sites;
}

export function getSite(domain) {
  return siteMap.get(domain) || null;
}

export function addSite(site) {
  config.sites.push(site);
  persist();
}

export function updateSite(domain, updates) {
  const idx = config.sites.findIndex((s) => s.domain === domain);
  if (idx < 0) return false;
  config.sites[idx] = { ...config.sites[idx], ...updates };
  persist();
  return true;
}

export function removeSite(domain) {
  const before = config.sites.length;
  config.sites = config.sites.filter((s) => s.domain !== domain);
  if (config.sites.length === before) return false;
  persist();
  return true;
}

export function getStats() {
  return {
    total: config.sites.length,
    protected: config.sites.filter((s) => s.protected).length,
  };
}

function persist() {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
  siteMap = new Map(config.sites.map((s) => [s.domain, s]));
}
