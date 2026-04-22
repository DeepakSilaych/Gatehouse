import { Router } from 'express';
import { getToken, verifyToken } from '../auth.js';
import { evaluate } from '../rules.js';
import { findSession, touchSession } from '../db.js';

const router = Router();

function extractRequestInfo(req) {
  const proto = req.get('X-Forwarded-Proto') || 'https';
  const host = req.get('X-Forwarded-Host') || req.get('host');
  const uri = req.get('X-Forwarded-Uri') || '/';
  const ip = req.get('X-Real-IP') || req.get('X-Forwarded-For')?.split(',')[0]?.trim() || req.ip;
  return { proto, host, uri, ip };
}

function handleUnauth(req, res) {
  const { proto, host, uri } = extractRequestInfo(req);
  const original = encodeURIComponent(`${proto}://${host}${uri}`);
  const rd = req.query.rd;

  if (rd) return res.redirect(`${rd}/login?redirect=${original}`);

  const authDomain = process.env.AUTH_DOMAIN;
  res.set('X-Auth-Redirect', `${proto}://${authDomain}/login?redirect=${original}`);
  res.sendStatus(401);
}

router.get('/verify', (req, res) => {
  const { host, uri, ip } = extractRequestInfo(req);
  const { requiresAuth } = evaluate(host, uri, ip);

  if (!requiresAuth) return res.sendStatus(200);

  const payload = verifyToken(getToken(req));
  if (!payload) return handleUnauth(req, res);

  if (payload.sid) {
    const session = findSession(payload.sid);
    if (!session) return handleUnauth(req, res);
    touchSession(payload.sid);
  }

  res.set('X-Auth-User', payload.username);
  res.sendStatus(200);
});

export default router;
