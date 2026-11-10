// Sends the shop's customer an e-mail when their parcel moves.
const amqp = require('amqplib');

async function start() {
  const channel = await (await amqp.connect(process.env.AMQP_URL)).createChannel();
  await channel.assertQueue('parcel.moved', { durable: true });
  channel.consume('parcel.moved', async (message) => {
    const event = JSON.parse(message.content.toString());
    const response = await fetch(`${process.env.MAIL_API_URL}/send`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ template: 'parcel-moved', shipmentId: event.shipmentId, text: event.description }),
    });
    if (response.ok) channel.ack(message); else channel.nack(message, false, false); // dropped after one failure
  });
}
start();
