import { Router } from 'express';
import { findByUsername, createSession, removeSession } from '../db.js';
import {
  verifyPassword, createToken, setAuthCookie, clearAuthCookie,
  getToken, verifyToken, SESSION_MS,
} from '../auth.js';
import { renderLoginPage } from '../pages/login.js';

const router = Router();

router.get('/login', (req, res) => {
  if (verifyToken(getToken(req))) {
    return res.redirect(req.query.redirect || '/');
  }
  res.type('html').send(renderLoginPage(req.query.redirect));
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const redirect = req.body.redirect || '/';

  if (!username || !password) {
    return res.type('html').send(renderLoginPage(redirect, 'Username and password are required'));
  }

  const user = findByUsername(username);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.type('html').send(renderLoginPage(redirect, 'Invalid credentials'));
  }

  const { token, sid } = createToken(user);
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  const ip = req.get('X-Forwarded-For')?.split(',')[0]?.trim() || req.ip;
  createSession(sid, user.id, user.username, ip, req.get('user-agent'), expiresAt);

  setAuthCookie(res, token);
  res.redirect(redirect);
});

router.get('/logout', (req, res) => {
  const payload = verifyToken(getToken(req));
  if (payload?.sid) removeSession(payload.sid);
  clearAuthCookie(res);
  res.redirect('/login');
});

export default router;
