const express = require('express');
const passport = require('../auth');

const router = express.Router();

// Kick off Google OAuth.
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google redirects back here after the user approves.
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/?auth=error' }),
  (req, res) => res.redirect('/')
);

// Who am I?  Returns { user: null } when signed out.
router.get('/me', (req, res) => {
  if (!req.user) return res.json({ user: null });
  const { id, email, name, picture } = req.user;
  res.json({ user: { id, email, name, picture } });
});

// Log out. Destroys the session so the cookie can't be replayed.
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('gofirst.sid');
      res.json({ ok: true });
    });
  });
});

module.exports = router;
