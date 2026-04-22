import { getToken, verifyToken } from './auth.js';
import { findSession } from './db.js';

export const requireAuth = (req, res, next) => {
  const payload = verifyToken(getToken(req));

  if (!payload || (payload.sid && !findSession(payload.sid))) {
    if (req.headers.accept?.includes('application/json') || req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect(`/login?redirect=${encodeURIComponent(req.originalUrl)}`);
  }

  req.user = payload;
  next();
};
