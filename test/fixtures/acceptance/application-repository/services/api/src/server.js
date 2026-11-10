// HTTP API for shops, and the public tracking page for their customers.
const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const amqp = require('amqplib');
const { requireShopToken } = require('./auth');

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const cache = createClient({ url: process.env.REDIS_URL });
const app = express();
app.use(express.json());

let channel;
async function publish(queue, message) {
  await channel.assertQueue(queue, { durable: true });
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
}

// Shops create a shipment; the worker books it with the carrier.
app.post('/v1/shipments', requireShopToken, async (req, res) => {
  const { rows } = await db.query(
    'insert into shipments (shop_id, recipient, address, status) values ($1, $2, $3, $4) returning id, tracking_code',
    [req.shop.id, req.body.recipient, req.body.address, 'created'],
  );
  await publish('shipments.book', { shipmentId: rows[0].id });
  res.status(201).json(rows[0]);
});

app.get('/v1/shipments/:id', requireShopToken, async (req, res) => {
  const { rows } = await db.query('select * from shipments where id = $1 and shop_id = $2', [req.params.id, req.shop.id]);
  if (!rows.length) return res.sendStatus(404);
  res.json(rows[0]);
});

// Public tracking page data: cached, because customers refresh it often.
app.get('/track/:code', async (req, res) => {
  const key = `track:${req.params.code}`;
  const cached = await cache.get(key);
  if (cached) return res.json(JSON.parse(cached));
  const { rows } = await db.query(
    'select s.status, e.description, e.occurred_at from shipments s left join tracking_events e on e.shipment_id = s.id where s.tracking_code = $1 order by e.occurred_at desc',
    [req.params.code],
  );
  if (!rows.length) return res.sendStatus(404);
  await cache.set(key, JSON.stringify(rows), { EX: 60 });
  res.json(rows);
});

async function start() {
  await cache.connect();
  channel = await (await amqp.connect(process.env.AMQP_URL)).createChannel();
  app.listen(8080);
}
start();
