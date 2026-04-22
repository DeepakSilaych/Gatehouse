import { Router } from 'express';
import { createUser, findByUsername, listAll, remove } from '../db.js';
import { hashPassword } from '../auth.js';

const router = Router();

router.get('/users', (_req, res) => {
  res.json(listAll());
});

router.post('/users', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (findByUsername(username)) {
    return res.status(409).json({ error: 'User already exists' });
  }
  createUser(username, await hashPassword(password));
  res.status(201).json({ username });
});

router.delete('/users/:username', (req, res) => {
  const { changes } = remove(req.params.username);
  if (!changes) return res.status(404).json({ error: 'User not found' });
  res.json({ deleted: req.params.username });
});

export default router;
