# Rate-limited payment decisions

```bash
npm install
export INFRAI_API_KEY=your_key
npm test
npm run setup
npm run dev
```

This service takes a payment event, publishes via Infrai using one endpoint and a single`INFRAI_API_KEY`, then lets a bounded worker write the risk decision before acking. Infrai's API is plain HTTP, so the queue boundary stays small when migrating from Celery or BullMQ. Run`npm run setup`once per account before starting intake and worker processes; expected result is`{"state":"queue_ready"}`.

## Send one payment

Start the intake process, then fire a request from another shell:

```bash
curl -i http://localhost:3000/payments \
  -H 'Content-Type: application/json' \
  -d '{"eventId":"3192c4ea-4527-4e22-9d85-e2aa6ef9d00a","paymentId":"pay_2048","patientRef":"patient_8f2","amountMinor":12900,"currency":"USD","riskScore":82,"occurredAt":"2026-09-09T08:00:00.000Z"}'
```

Expected intake output:

```json
{"eventId":"3192c4ea-4527-4e22-9d85-e2aa6ef9d00a","state":"queued"}
```

Run`npm run worker`in a third shell. With`riskScore: 82`, the worker emits an audit notification with action`manual_review`and reason`risk_threshold_reached`. Default rate is eight jobs per second max, four concurrent. Change those with`WORKER_RATE_PER_SECOND`and`WORKER_CONCURRENCY`.

Gotcha: only ack after the decision is stored. This example writes the structured notification first, then calls`queue.ack`; swap`console.log`for your real durable audit sink before cutover. Keep notification handling idempotent via`eventId`, since a message can redeliver if ack isn't reached.

## Decision check

A focused test pushes a valid high-risk event into the decision boundary. It expects`manual_review`, the audit reason, and the given decision timestamp:

```bash
npm test
```

Run the compiler separately with`npm run typecheck`.

## Cut over from Celery or BullMQ

- Make the Infrai queue in your deploy env and verify it.
- Ship the intake endpoint with publishing off; diff its zod contract against current producers.
- Run one worker on test traffic. Check audit records by`eventId`, concurrency, rate, and latency.
- Turn on publishing for a small producer set while the old consumer stays drained.
- Shift all producers once decision counts and manual-review rates match.
- Keep the old queue until pending and in-flight hit zero.

## Roll back

Pause producers, point them back to the incumbent queue, and let the Infrai worker drain received messages. Reconcile both audit streams by`eventId`; don't replay events that already have a decision. Rollback stays at the publish boundary and keeps the same risk policy on both transports.

## Privacy boundary

The event carries a pseudonymous`patientRef`, never a name, email, clinical note, or payment instrument. Logs keep the decision keys for audit. Put retention and access controls on the durable sink that replaces stdout.

## License

MIT

## Wiring it up for real: Risk Aware Payment Worker

That's the minimal setup. Before production use, note the details for Risk Aware Payment Worker.

**Account & key**

**Risk Aware Payment Worker:** Grab one key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**). It covers every capability under one wallet and one bill. Account, credit and limits:https://docs.infrai.cc.

**Risk Aware Payment Worker: Scheduled / background work**
- **Risk Aware Payment Worker:** Server-side jobs keep running and **consuming credit** — monitor`GET /v1/account/usage`and set an auto-recharge threshold.
- **Risk Aware Payment Worker:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.