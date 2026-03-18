'use strict';
const express = require('express');
const db      = require('../db');
const { requireAuth, requireWorkerOrAdmin } = require('../middleware/auth');
const router  = express.Router();

/* ── Public: submit return request (no auth needed, just tracking_id) ───── */
router.post('/request', (req, res) => {
  const { tracking_id, reason } = req.body;
  if (!tracking_id || !reason)
    return res.status(400).json({ error: 'tracking_id and reason are required' });

  const p = db.prepare(`SELECT * FROM parcels WHERE tracking_id=?`).get(tracking_id);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });
  if (p.status !== 'delivered')
    return res.status(400).json({ error: 'Only delivered parcels can be returned' });

  // Check no pending request exists
  const existing = db.prepare(
    `SELECT * FROM return_requests WHERE parcel_id=? AND status='pending'`
  ).get(p.id);
  if (existing) return res.status(409).json({ error: 'A return request already exists for this parcel' });

  db.prepare(`UPDATE parcels SET status='return_requested', updated_at=? WHERE id=?`).run(Date.now(), p.id);
  db.prepare(`INSERT INTO return_requests (parcel_id,tracking_id,reason) VALUES (?,?,?)`)
    .run(p.id, tracking_id, reason);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,actor_label) VALUES (?,?,?,?)`)
    .run(p.id, 'return_requested', `Return requested: ${reason}`, 'Customer');
  db.prepare(`INSERT INTO notifications (type,text) VALUES (?,?)`)
    .run('warn', `Return requested for parcel ${tracking_id}`);

  res.status(201).json({ ok: true, message: 'Return request submitted successfully' });
});

/* ── Staff: list all return requests ────────────────────────────────────── */
router.get('/', requireWorkerOrAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT r.*, p.courier_name, p.destination, p.recipient_name
    FROM return_requests r
    JOIN parcels p ON p.id=r.parcel_id
    ORDER BY r.requested_at DESC
  `).all());
});

/* ── Staff: approve / reject ────────────────────────────────────────────── */
router.patch('/:id', requireWorkerOrAdmin, (req, res) => {
  const { status, notes } = req.body;
  if (!['approved','rejected','picked_up'].includes(status))
    return res.status(400).json({ error: 'status must be approved, rejected or picked_up' });

  const ret = db.prepare(`SELECT * FROM return_requests WHERE id=?`).get(req.params.id);
  if (!ret) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE return_requests SET status=?, resolved_at=?, resolved_by=?, notes=? WHERE id=?`)
    .run(status, Date.now(), req.session.user.id, notes||'', ret.id);

  const parcelStatus = status === 'approved' ? 'return_requested'
                     : status === 'picked_up' ? 'returned'
                     : 'delivered'; // rejected → back to delivered

  db.prepare(`UPDATE parcels SET status=?, updated_at=? WHERE id=?`).run(parcelStatus, Date.now(), ret.parcel_id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(ret.parcel_id, parcelStatus, `Return ${status}: ${notes||''}`, req.session.user.id, req.session.user.name);

  res.json({ ok: true });
});

module.exports = router;
