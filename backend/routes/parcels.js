'use strict';
const express = require('express');
const db      = require('../db');
const { requireAuth, requireWorkerOrAdmin, requireAdmin } = require('../middleware/auth');
const router  = express.Router();

const withHistory = db.prepare(`
  SELECT p.*,
         (SELECT json_group_array(json_object(
           'status', h.status, 'note', h.note,
           'actor_label', h.actor_label, 'time', h.time
         )) FROM status_history h WHERE h.parcel_id = p.id ORDER BY h.time ASC) AS history
  FROM parcels p
`);

router.get('/', requireAuth, (req, res) => {
  res.json(db.prepare(`
    SELECT p.*,
      (SELECT json_group_array(json_object(
        'status', h.status,'note',h.note,'actor_label',h.actor_label,'time',h.time
      )) FROM status_history h WHERE h.parcel_id=p.id ORDER BY h.time ASC) AS history
    FROM parcels p ORDER BY p.updated_at DESC
  `).all());
});

router.get('/stats', requireAuth, (req, res) => {
  const stats = {};
  for (const s of ['arrived','sorted','dispatched','delivered','return_requested','returned']) {
    stats[s] = db.prepare(`SELECT COUNT(*) as c FROM parcels WHERE status=?`).get(s).c;
  }
  res.json(stats);
});

router.get('/search', requireAuth, (req, res) => {
  const q = `%${req.query.q || ''}%`;
  res.json(db.prepare(`
    SELECT * FROM parcels
    WHERE tracking_id LIKE ? OR recipient_name LIKE ? OR destination LIKE ?
    ORDER BY updated_at DESC LIMIT 50
  `).all(q, q, q));
});

/* Public track-by-tracking-id (no auth) */
router.get('/track/:trackingId', (req, res) => {
  const p = db.prepare(`SELECT * FROM parcels WHERE tracking_id=?`).get(req.params.trackingId);
  if (!p) return res.status(404).json({ error: 'Parcel not found' });
  const history = db.prepare(
    `SELECT status,note,actor_label,time FROM status_history WHERE parcel_id=? ORDER BY time ASC`
  ).all(p.id);
  // Sanitise: don't expose phone to public track
  const { phone, created_by, ...safe } = p;
  res.json({ ...safe, history });
});

router.post('/', requireWorkerOrAdmin, (req, res) => {
  const { tracking_id, courier_name, source, destination, recipient_name, phone, weight_kg, notes } = req.body;
  if (!tracking_id || !courier_name || !destination)
    return res.status(400).json({ error: 'tracking_id, courier_name and destination are required' });

  const info = db.prepare(`
    INSERT INTO parcels (tracking_id,courier_name,source,destination,recipient_name,phone,weight_kg,notes,created_by)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).run(tracking_id, courier_name, source||'Itanagar', destination, recipient_name||'', phone||'', weight_kg||'', notes||'', req.session.user.id);

  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(info.lastInsertRowid, 'arrived', 'Parcel received', req.session.user.id, req.session.user.name);

  db.prepare(`INSERT INTO notifications (type,text) VALUES (?,?)`)
    .run('info', `New parcel received: ${tracking_id}`);

  res.status(201).json({ id: info.lastInsertRowid, tracking_id });
});

router.post('/:id/sort', requireWorkerOrAdmin, (req, res) => {
  const p = db.prepare(`SELECT * FROM parcels WHERE id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  if (p.status !== 'arrived') return res.status(400).json({ error: 'Parcel must be in arrived state' });

  db.prepare(`UPDATE parcels SET status='sorted', updated_at=? WHERE id=?`).run(Date.now(), p.id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(p.id, 'sorted', 'Sorted at hub', req.session.user.id, req.session.user.name);
  res.json({ ok: true });
});

router.patch('/:id/status', requireWorkerOrAdmin, (req, res) => {
  const { status, note } = req.body;
  const allowed = ['arrived','sorted','dispatched','delivered','return_requested','returned'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const p = db.prepare(`SELECT * FROM parcels WHERE id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE parcels SET status=?, updated_at=? WHERE id=?`).run(status, Date.now(), p.id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(p.id, status, note||'', req.session.user.id, req.session.user.name);
  res.json({ ok: true });
});

router.patch('/:id/override', requireAdmin, (req, res) => {
  const { status, reason } = req.body;
  if (!status || !reason) return res.status(400).json({ error: 'status and reason required' });
  const p = db.prepare(`SELECT * FROM parcels WHERE id=?`).get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });

  db.prepare(`UPDATE parcels SET status=?, updated_at=? WHERE id=?`).run(status, Date.now(), p.id);
  db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`)
    .run(p.id, status, `[ADMIN OVERRIDE] ${reason}`, req.session.user.id, req.session.user.name);
  res.json({ ok: true });
});

module.exports = router;
