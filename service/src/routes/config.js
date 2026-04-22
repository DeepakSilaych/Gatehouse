import { Router } from 'express';
import { getSites, getSite, addSite, updateSite, removeSite, getStats as siteStats } from '../rules.js';
import { countUsers, countSessions } from '../db.js';

const router = Router();

router.get('/sites', (_req, res) => {
  res.json(getSites());
});

router.post('/sites', (req, res) => {
  const { domain, upstream } = req.body;
  if (!domain || !upstream) {
    return res.status(400).json({ error: 'Domain and upstream required' });
  }
  if (getSite(domain)) {
    return res.status(409).json({ error: 'Site already exists' });
  }
  const site = {
    domain,
    upstream,
    protected: req.body.protected ?? true,
    ...(req.body.public_paths?.length && { public_paths: req.body.public_paths }),
    ...(req.body.ip_whitelist?.length && { ip_whitelist: req.body.ip_whitelist }),
  };
  addSite(site);
  res.status(201).json(site);
});

router.put('/api/sites/:domain', (req, res) => {
  const { domain } = req.params;
  if (!getSite(domain)) {
    return res.status(404).json({ error: 'Site not found' });
  }
  const allowed = ['upstream', 'protected', 'public_paths', 'ip_whitelist'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  updateSite(domain, updates);
  res.json(getSite(domain));
});

router.delete('/api/sites/:domain', (req, res) => {
  if (!removeSite(req.params.domain)) {
    return res.status(404).json({ error: 'Site not found' });
  }
  res.json({ deleted: req.params.domain });
});

router.get('/stats', (_req, res) => {
  const sites = siteStats();
  res.json({
    users: countUsers(),
    sessions: countSessions(),
    sites: sites.total,
    protected_sites: sites.protected,
  });
});

export default router;
