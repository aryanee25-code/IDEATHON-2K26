'use strict';
const express = require('express');
const db      = require('../db');
const { requireAuth, requireDriver } = require('../middleware/auth');
const router  = express.Router();

/* ── Staff confirm delivery ─────────────────────────────────────────────── */
router.post('/confirm/:parcelId', requireAuth, (req, res) => {
  const p = db.prepare(`SELECT * FROM parcels WHERE id=?`).get(req.params.parcelId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.status !== 'dispatched') return res.status(400).json({ error: 'Parcel must be dispatched' });

  db.prepare(`UPDATE parcels SET status='delivered', updated_at=? WHERE id=?`).run(Date.now(), p.id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(p.id, 'delivered', 'Confirmed delivered', req.session.user.id, req.session.user.name);
  db.prepare(`INSERT INTO notifications (type,text) VALUES (?,?)`)
    .run('success', `Parcel ${p.tracking_id} delivered successfully`);
  res.json({ ok: true });
});

/* ── Driver: get my assigned parcels ────────────────────────────────────── */
router.get('/my-parcels', requireDriver, (req, res) => {
  const driverName = req.session.user.name;
  const parcels = db.prepare(`
    SELECT * FROM parcels
    WHERE driver=? AND status IN ('dispatched','delivered')
    ORDER BY updated_at DESC
  `).all(driverName);
  res.json(parcels);
});

/* ── Driver: mark parcel as delivered ───────────────────────────────────── */
router.post('/driver-confirm/:parcelId', requireDriver, (req, res) => {
  const { note } = req.body;
  const p = db.prepare(`SELECT * FROM parcels WHERE id=?`).get(req.params.parcelId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.status !== 'dispatched') return res.status(400).json({ error: 'Parcel must be in dispatched state' });

  const driverName = req.session.user.name;
  db.prepare(`UPDATE parcels SET status='delivered', updated_at=? WHERE id=?`).run(Date.now(), p.id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(p.id, 'delivered', note || 'Delivered by driver', req.session.user.id, driverName);
  db.prepare(`INSERT INTO notifications (type,text) VALUES (?,?)`)
    .run('success', `Driver ${driverName} confirmed delivery of ${p.tracking_id}`);
  res.json({ ok: true });
});

/* ── Driver: mark parcel as failed delivery ─────────────────────────────── */
router.post('/driver-failed/:parcelId', requireDriver, (req, res) => {
  const { note } = req.body;
  if (!note) return res.status(400).json({ error: 'Note/reason is required for failed delivery' });

  const p = db.prepare(`SELECT * FROM parcels WHERE id=?`).get(req.params.parcelId);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.status !== 'dispatched') return res.status(400).json({ error: 'Parcel must be in dispatched state' });

  const driverName = req.session.user.name;
  db.prepare(`UPDATE parcels SET status='sorted', updated_at=? WHERE id=?`).run(Date.now(), p.id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(p.id, 'sorted', `[FAILED DELIVERY] ${note}`, req.session.user.id, driverName);
  db.prepare(`INSERT INTO notifications (type,text) VALUES (?,?)`)
    .run('warn', `Driver ${driverName} reported failed delivery for ${p.tracking_id}: ${note}`);
  res.json({ ok: true });
});

/* ── OTP ────────────────────────────────────────────────────────────────── */
router.post('/otp/generate', requireAuth, (req, res) => {
  const { tracking_id } = req.body;
  if (!tracking_id) return res.status(400).json({ error: 'tracking_id required' });
  const code = String(Math.floor(1000 + Math.random() * 9000));
  const expires_at = Date.now() + 10 * 60 * 1000;
  db.prepare(`INSERT OR REPLACE INTO otps (tracking_id,code,expires_at) VALUES (?,?,?)`).run(tracking_id, code, expires_at);
  // In production: send via SMS
  res.json({ ok: true, otp: code });
});

router.post('/otp/verify', requireAuth, (req, res) => {
  const { tracking_id, code } = req.body;
  const row = db.prepare(`SELECT * FROM otps WHERE tracking_id=?`).get(tracking_id);
  if (!row || row.code !== code || Date.now() > row.expires_at)
    return res.status(400).json({ error: 'Invalid or expired OTP' });

  const p = db.prepare(`SELECT * FROM parcels WHERE tracking_id=?`).get(tracking_id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });

  db.prepare(`UPDATE parcels SET status='delivered', updated_at=? WHERE id=?`).run(Date.now(), p.id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(p.id, 'delivered', 'Delivered via OTP verification', req.session.user.id, req.session.user.name);
  db.prepare(`DELETE FROM otps WHERE tracking_id=?`).run(tracking_id);
  db.prepare(`INSERT INTO notifications (type,text) VALUES (?,?)`)
    .run('success', `Parcel ${tracking_id} delivered via OTP`);
  res.json({ ok: true });
});

module.exports = router;
