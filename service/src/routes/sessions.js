import { Router } from 'express';
import { listSessions, removeSession } from '../db.js';

const router = Router();

router.get('/api/sessions', (_req, res) => {
  res.json(listSessions());
});

router.delete('/api/sessions/:id', (req, res) => {
  const { changes } = removeSession(req.params.id);
  if (!changes) return res.status(404).json({ error: 'Session not found' });
  res.json({ revoked: req.params.id });
});

export default router;
