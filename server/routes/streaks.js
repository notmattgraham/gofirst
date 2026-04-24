const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

function shape(s) {
  return {
    id: s.id,
    name: s.name,
    type: 'quit',
    startAt: s.startAt,
    createdAt: s.createdAt.getTime ? s.createdAt.getTime() : s.createdAt,
  };
}

router.get('/', async (req, res) => {
  const rows = await prisma.quitStreak.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ streaks: rows.map(shape) });
});

router.post('/', async (req, res) => {
  const { name, startAt } = req.body || {};
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return res.status(400).json({ error: 'name required' });
  const row = await prisma.quitStreak.create({
    data: {
      userId: req.user.id,
      name: trimmed,
      startAt: startAt || new Date().toISOString(),
    },
  });
  res.json({ streak: shape(row) });
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.quitStreak.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: 'not found' });
  const data = {};
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) data.name = String(req.body.name || '').trim();
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'startAt')) data.startAt = req.body.startAt;
  const row = await prisma.quitStreak.update({ where: { id }, data });
  res.json({ streak: shape(row) });
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.quitStreak.findUnique({ where: { id } });
  if (!existing || existing.userId !== req.user.id) return res.status(404).json({ error: 'not found' });
  await prisma.quitStreak.delete({ where: { id } });
  res.json({ ok: true });
});

router.post('/import', async (req, res) => {
  const { streaks } = req.body || {};
  if (!Array.isArray(streaks)) return res.status(400).json({ error: 'streaks array required' });
  const existingCount = await prisma.quitStreak.count({ where: { userId: req.user.id } });
  if (existingCount > 0) return res.status(409).json({ error: 'streaks already exist' });
  const rows = await prisma.$transaction(streaks.map((s) => prisma.quitStreak.create({
    data: {
      userId: req.user.id,
      name: String(s.name || '').slice(0, 80),
      startAt: s.startAt || new Date().toISOString(),
    },
  })));
  res.json({ created: rows.length });
});

module.exports = router;
