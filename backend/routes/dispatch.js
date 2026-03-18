'use strict';
const express = require('express');
const db      = require('../db');
const { requireWorkerOrAdmin } = require('../middleware/auth');
const router  = express.Router();

router.get('/', requireWorkerOrAdmin, (req, res) => {
  const runs = db.prepare(`SELECT * FROM deliveries ORDER BY created_at DESC`).all();
  for (const r of runs) {
    r.parcels = db.prepare(`
      SELECT p.tracking_id, p.recipient_name, p.destination, p.status
      FROM delivery_parcels dp JOIN parcels p ON p.id=dp.parcel_id
      WHERE dp.delivery_id=?
    `).all(r.id);
  }
  res.json(runs);
});

router.post('/', requireWorkerOrAdmin, (req, res) => {
  const { driver_name, vehicle, notes, parcel_ids } = req.body;
  if (!driver_name || !vehicle || !Array.isArray(parcel_ids) || !parcel_ids.length)
    return res.status(400).json({ error: 'driver_name, vehicle and parcel_ids required' });

  const delivery_id = 'RUN-' + Date.now();
  const info = db.prepare(
    `INSERT INTO deliveries (delivery_id,driver_name,vehicle,notes,created_by) VALUES (?,?,?,?,?)`
  ).run(delivery_id, driver_name, vehicle, notes||'', req.session.user.id);

  const insertDP  = db.prepare(`INSERT INTO delivery_parcels (delivery_id,parcel_id) VALUES (?,?)`);
  const updateP   = db.prepare(`UPDATE parcels SET status='dispatched',driver=?,vehicle=?,updated_at=? WHERE id=? AND status='sorted'`);
  const insertHist= db.prepare(`INSERT INTO status_history (parcel_id,status,note,changed_by,actor_label) VALUES (?,?,?,?,?)`);

  for (const pid of parcel_ids) {
    insertDP.run(info.lastInsertRowid, pid);
    updateP.run(driver_name, vehicle, Date.now(), pid);
    insertHist.run(pid, 'dispatched', `Dispatched with ${delivery_id}, driver: ${driver_name}`, req.session.user.id, req.session.user.name);
  }

  db.prepare(`INSERT INTO notifications (type,text) VALUES (?,?)`)
    .run('info', `Dispatch run ${delivery_id} created (${parcel_ids.length} parcels)`);
  res.status(201).json({ delivery_id });
});

module.exports = router;
