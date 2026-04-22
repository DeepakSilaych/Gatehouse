import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';

const {
  JWT_SECRET = 'change-me',
  SESSION_HOURS = '168',
  COOKIE_DOMAIN = '',
} = process.env;

const SESSION_MS = parseInt(SESSION_HOURS, 10) * 60 * 60 * 1000;
const COOKIE_NAME = '__gatehouse_token';

export { SESSION_HOURS, SESSION_MS };

export const hashPassword = (password) => bcrypt.hash(password, 12);

export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

export const createToken = (user) => {
  const sid = randomUUID();
  const token = jwt.sign(
    { id: user.id, username: user.username, sid },
    JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` },
  );
  return { token, sid };
};

export const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
};

export const getToken = (req) => req.cookies?.[COOKIE_NAME] || null;

export const setAuthCookie = (res, token) => {
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MS,
    path: '/',
  };
  if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
  res.cookie(COOKIE_NAME, token, opts);
};

export const clearAuthCookie = (res) => {
  const opts = { path: '/' };
  if (COOKIE_DOMAIN) opts.domain = COOKIE_DOMAIN;
  res.clearCookie(COOKIE_NAME, opts);
};
