// Admin / developer dashboard. Hidden URL at /admin in the SPA layer; this
// router holds the JSON endpoints. Every request must come from the single
// allow-listed admin email — anyone else gets a 404 (not 403, so the
// existence of the dashboard isn't even acknowledged to other accounts).

const express = require('express');
const prisma = require('../db');
const { requireAuth } = require('../middleware');
const { dateInTz } = require('../time');

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'notmattgraham@gmail.com').toLowerCase();

const router = express.Router();
router.use(requireAuth);

// Email gate. 404 (not 403) so the route is invisible to non-admins.
router.use((req, res, next) => {
  if (!req.user || (req.user.email || '').toLowerCase() !== ADMIN_EMAIL) {
    return res.status(404).json({ error: 'not_found' });
  }
  next();
});

// "Am I admin?" — used by the dashboard UI to show/hide itself before
// kicking off the heavier data calls.
router.get('/me', (req, res) => {
  res.json({
    admin: true,
    email: req.user.email,
    name: req.user.name,
  });
});

// Helper: walk a task across the whole window since createdAt and tally
// scheduled vs completed days. Mirrors the logic the frontend uses for
// per-user analytics, but server-side so the dashboard can show one number.
function taskCounts(t) {
  const completedDates = Array.isArray(t.completedDates) ? t.completedDates : [];
  if (!t.recurrence) {
    // One-shots: scheduled = 1 if it has a scheduledDate, completed = 1 if done.
    if (!t.scheduledDate) return { scheduled: 0, completed: 0 };
    return { scheduled: 1, completed: t.done ? 1 : 0 };
  }
  // Recurring: count days-of-week from createdAt to "today" (server UTC date is
  // close enough for an aggregate dashboard — exact per-user TZ isn't worth the
  // cost when we're just rolling up across all users).
  const days = (t.recurrence && t.recurrence.daysOfWeek) || [];
  if (!days.length) return { scheduled: 0, completed: completedDates.length };
  const start = new Date(t.createdAt);
  const today = new Date();
  start.setUTCHours(0, 0, 0, 0);
  today.setUTCHours(0, 0, 0, 0);
  let scheduled = 0;
  for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    if (days.includes(d.getUTCDay())) scheduled++;
  }
  return { scheduled, completed: completedDates.length };
}

// Collapse a list of tasks into top-line numbers for one user.
function summarizeTasks(tasks) {
  let scheduled = 0, completed = 0;
  const byCategory = {};
  let recurringCount = 0;
  let oneShotCount = 0;
  for (const t of tasks) {
    const c = taskCounts(t);
    scheduled += c.scheduled;
    completed += c.completed;
    if (t.recurrence) recurringCount++; else oneShotCount++;
    const cat = t.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = { scheduled: 0, completed: 0 };
    byCategory[cat].scheduled += c.scheduled;
    byCategory[cat].completed += c.completed;
  }
  const executionRate = scheduled > 0 ? completed / scheduled : null;
  return {
    totalTasks: tasks.length,
    recurringCount,
    oneShotCount,
    scheduled,
    completed,
    executionRate,
    byCategory,
  };
}

// GET /api/admin/stats — aggregate numbers for the whole app.
router.get('/stats', async (_req, res) => {
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const sevenDaysAgo = new Date(now.getTime() - 7 * day);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * day);

  const [userCount, taskCount, streakCount, newUsers7, newUsers30, activeUsers7, doneOneShots, recurringTasks] = await Promise.all([
    prisma.user.count(),
    prisma.task.count(),
    prisma.quitStreak.count(),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    // "Active" = touched a task in the last 7 days. Cheaper than scanning sessions.
    prisma.task.findMany({
      where: { updatedAt: { gte: sevenDaysAgo } },
      select: { userId: true },
      distinct: ['userId'],
    }),
    prisma.task.count({ where: { recurrence: null, done: true } }),
    prisma.task.findMany({
      where: { recurrence: { not: null } },
      select: { completedDates: true },
    }),
  ]);

  const recurringCompletions = recurringTasks.reduce((acc, t) => acc + (t.completedDates || []).length, 0);

  // Override usage across all users — small table, fine to load.
  const usersForOverrides = await prisma.user.findMany({
    select: { overridesUsed: true },
  });
  const totalOverrides = usersForOverrides.reduce((a, u) => a + (u.overridesUsed || 0), 0);

  res.json({
    users: {
      total: userCount,
      newLast7Days: newUsers7,
      newLast30Days: newUsers30,
      activeLast7Days: activeUsers7.length,
    },
    tasks: {
      total: taskCount,
      oneShotCompletions: doneOneShots,
      recurringCompletions,
    },
    streaks: {
      total: streakCount,
    },
    overrides: {
      totalUsed: totalOverrides,
    },
    serverDate: dateInTz(now, 'UTC'),
  });
});

// GET /api/admin/users — list every user with light per-user rollups.
router.get('/users', async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      tasks: {
        select: {
          id: true, recurrence: true, scheduledDate: true, done: true,
          completedDates: true, category: true, createdAt: true, updatedAt: true,
        },
      },
      quitStreaks: { select: { id: true } },
    },
  });

  const rows = users.map((u) => {
    const summary = summarizeTasks(u.tasks);
    const lastTaskTouch = u.tasks.reduce((max, t) => {
      const ts = t.updatedAt instanceof Date ? t.updatedAt.getTime() : new Date(t.updatedAt).getTime();
      return ts > max ? ts : max;
    }, 0);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      picture: u.picture,
      timezone: u.timezone,
      createdAt: u.createdAt,
      lastActivityAt: lastTaskTouch ? new Date(lastTaskTouch).toISOString() : null,
      overridesUsed: u.overridesUsed,
      coachingClient: u.coachingClient,
      taskCount: summary.totalTasks,
      streakCount: u.quitStreaks.length,
      executionRate: summary.executionRate,
      scheduled: summary.scheduled,
      completed: summary.completed,
    };
  });

  res.json({ users: rows });
});

// PATCH /api/admin/users/:id/coaching — toggle coachingClient for a user.
// Body: { coachingClient: boolean }
router.patch('/users/:id/coaching', async (req, res) => {
  const { coachingClient } = req.body || {};
  if (typeof coachingClient !== 'boolean') {
    return res.status(400).json({ error: 'coachingClient_required' });
  }
  try {
    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: { coachingClient },
      select: { id: true, email: true, name: true, coachingClient: true },
    });
    res.json({ user: updated });
  } catch (e) {
    if (e && e.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    throw e;
  }
});

// GET /api/admin/coaching-clients — every flagged client with full drill-down.
// One bundled call so the dashboard can render the coaching section without
// firing off a per-client request for each one.
router.get('/coaching-clients', async (_req, res) => {
  const clients = await prisma.user.findMany({
    where: { coachingClient: true },
    orderBy: { createdAt: 'desc' },
    include: {
      tasks: { orderBy: { createdAt: 'desc' } },
      quitStreaks: { orderBy: { createdAt: 'desc' } },
    },
  });

  const payload = clients.map((u) => {
    const summary = summarizeTasks(u.tasks);
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        picture: u.picture,
        timezone: u.timezone,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
        overridesUsed: u.overridesUsed,
        overrideActiveDate: u.overrideActiveDate,
        coachingClient: u.coachingClient,
      },
      summary,
      tasks: u.tasks.map((t) => ({
        id: t.id,
        text: t.text,
        startedAt: t.startedAt,
        scheduledDate: t.scheduledDate,
        recurrence: t.recurrence,
        trackStreak: t.trackStreak,
        category: t.category,
        done: t.done,
        completedDates: t.completedDates,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      streaks: u.quitStreaks.map((s) => ({
        id: s.id,
        name: s.name,
        startAt: s.startAt,
        createdAt: s.createdAt,
      })),
    };
  });

  res.json({ clients: payload });
});

// GET /api/admin/users/:id — full per-user picture: tasks, streaks, analytics.
router.get('/users/:id', async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: {
      tasks: { orderBy: { createdAt: 'desc' } },
      quitStreaks: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!user) return res.status(404).json({ error: 'not_found' });

  const summary = summarizeTasks(user.tasks);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      timezone: user.timezone,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      overridesUsed: user.overridesUsed,
      overrideMonthStart: user.overrideMonthStart,
      overrideActiveDate: user.overrideActiveDate,
      coachingClient: user.coachingClient,
    },
    summary,
    tasks: user.tasks.map((t) => ({
      id: t.id,
      text: t.text,
      startedAt: t.startedAt,
      scheduledDate: t.scheduledDate,
      recurrence: t.recurrence,
      trackStreak: t.trackStreak,
      category: t.category,
      done: t.done,
      completedDates: t.completedDates,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    streaks: user.quitStreaks.map((s) => ({
      id: s.id,
      name: s.name,
      startAt: s.startAt,
      createdAt: s.createdAt,
    })),
  });
});

module.exports = router;
