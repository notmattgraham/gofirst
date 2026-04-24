// "Mulligans" — 3 free per rolling month, $4.99 each thereafter (purchase
// flow is a placeholder until in-app purchase is wired through Xcode).
//
// Using one unlocks today's list for the rest of the local day so the user
// can add/edit tasks on a day they failed to plan the night before.
const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware');
const { userToday, isOverrideActive } = require('../time');

const router = express.Router();
router.use(requireAuth);

const MAX_FREE_PER_MONTH = 3;
const MONTH_MS = 30 * 86400000;

function shape(user) {
  const monthStart = user.overrideMonthStart || user.createdAt;
  const elapsed = Date.now() - new Date(monthStart).getTime();
  const remaining = elapsed >= MONTH_MS ? MAX_FREE_PER_MONTH : Math.max(0, MAX_FREE_PER_MONTH - (user.overridesUsed || 0));
  return {
    used: user.overridesUsed || 0,
    remaining,
    monthStart,
    active: isOverrideActive(user),
    activeDate: user.overrideActiveDate || null,
  };
}

router.get('/', async (req, res) => {
  res.json({ overrides: shape(req.user) });
});

// POST /api/overrides/use — consumes one free override (if available)
// or returns 402 to trigger the paywall flow on the client.
router.post('/use', async (req, res) => {
  const today = userToday(req.user);
  const monthStart = req.user.overrideMonthStart || req.user.createdAt;
  const elapsed = Date.now() - new Date(monthStart).getTime();

  // Roll the monthly counter when we cross the 30-day boundary.
  const data = {};
  let usedThisMonth = req.user.overridesUsed || 0;
  if (elapsed >= MONTH_MS) {
    data.overrideMonthStart = new Date();
    data.overridesUsed = 0;
    usedThisMonth = 0;
  }

  if (usedThisMonth >= MAX_FREE_PER_MONTH) {
    return res.status(402).json({
      error: 'paywall',
      message: 'You\u2019ve used all 3 free overrides this month. Additional overrides are $4.99 each.',
      price: 499,
    });
  }

  data.overridesUsed = usedThisMonth + 1;
  data.overrideActiveDate = today;
  const user = await prisma.user.update({ where: { id: req.user.id }, data });
  res.json({ overrides: shape(user) });
});

// POST /api/overrides/purchase — placeholder paywall. Records the purchase
// intent and grants an override; in production this gets gated by an IAP
// receipt verification.
router.post('/purchase', async (_req, res) => {
  res.status(501).json({
    error: 'not_implemented',
    message: 'In-app purchase wiring is pending the Xcode wrap.',
  });
});

module.exports = router;
