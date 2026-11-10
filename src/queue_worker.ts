import { infrai } from "./infrai_queue.ts";
import { decidePayment, paymentEventSchema } from "./payment_event.ts";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 4);
const startsPerSecond = Number(process.env.WORKER_RATE_PER_SECOND ?? 8);
const intervalMs = Math.ceil(1_000 / startsPerSecond);
let nextStart = Date.now();

async function reserveStart(): Promise<void> {
  const startAt = Math.max(Date.now(), nextStart);
  nextStart = startAt + intervalMs;
  const delay = startAt - Date.now();
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

async function processOne(message: { message_id: string; payload: unknown }): Promise<void> {
  await reserveStart();
  const event = paymentEventSchema.parse(message.payload);
  const notification = decidePayment(event, new Date().toISOString());
  console.log(JSON.stringify({ type: "payment_decision", ...notification }));
  // The audit decision is emitted before acknowledgement so unfinished work can be delivered again.
  await infrai.queue.ack(message.message_id);
}

async function run(): Promise<void> {
  for (;;) {
    const batch = await infrai.queue.consume(concurrency, 60);
    const messages = batch.items ?? [];
    await Promise.allSettled(messages.map(processOne));
    if (messages.length === 0) await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
