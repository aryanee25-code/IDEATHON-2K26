'use strict';

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).json({ error: 'Admin only' });
}

function requireWorkerOrAdmin(req, res, next) {
  const role = req.session?.user?.role;
  if (role === 'admin' || role === 'worker') return next();
  res.status(403).json({ error: 'Worker or Admin only' });
}

function requireDriver(req, res, next) {
  const role = req.session?.user?.role;
  if (role === 'admin' || role === 'driver') return next();
  res.status(403).json({ error: 'Driver or Admin only' });
}

module.exports = { requireAuth, requireAdmin, requireWorkerOrAdmin, requireDriver };
