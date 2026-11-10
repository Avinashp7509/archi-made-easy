// Books new shipments with the carrier, then polls the carrier for tracking events.
const { Pool } = require('pg');
const amqp = require('amqplib');

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const CARRIER = process.env.CARRIER_API_URL;

async function bookShipment(channel, message) {
  const { shipmentId } = JSON.parse(message.content.toString());
  const { rows } = await db.query('select * from shipments where id = $1', [shipmentId]);
  const response = await fetch(`${CARRIER}/bookings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': String(shipmentId) },
    body: JSON.stringify({ recipient: rows[0].recipient, address: rows[0].address }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return channel.nack(message, false, true); // back on the queue, retried
  const booking = await response.json();
  await db.query('update shipments set status = $1, carrier_ref = $2 where id = $3', ['booked', booking.reference, shipmentId]);
  channel.ack(message);
}

// Every five minutes: ask the carrier about every parcel still on its way.
async function pollTracking(channel) {
  const { rows } = await db.query("select id, carrier_ref from shipments where status in ('booked', 'in_transit')");
  for (const shipment of rows) {
    const response = await fetch(`${CARRIER}/tracking/${shipment.carrier_ref}`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) continue;
    for (const event of await response.json()) {
      const inserted = await db.query(
        'insert into tracking_events (shipment_id, description, occurred_at) values ($1, $2, $3) on conflict do nothing returning id',
        [shipment.id, event.description, event.time],
      );
      if (inserted.rowCount) channel.sendToQueue('parcel.moved', Buffer.from(JSON.stringify({ shipmentId: shipment.id, description: event.description })), { persistent: true });
    }
  }
}

async function start() {
  const channel = await (await amqp.connect(process.env.AMQP_URL)).createChannel();
  await channel.assertQueue('shipments.book', { durable: true });
  await channel.assertQueue('parcel.moved', { durable: true });
  channel.consume('shipments.book', (message) => bookShipment(channel, message));
  setInterval(() => pollTracking(channel), 5 * 60 * 1000);
}
start();
