import assert from "node:assert/strict";
import test from "node:test";
import { decidePayment, paymentEventSchema } from "../src/payment_event.ts";

test("routes a high-risk payment to manual review with an audit reason", () => {
  const event = paymentEventSchema.parse({
    eventId: "3192c4ea-4527-4e22-9d85-e2aa6ef9d00a",
    paymentId: "pay_2048",
    patientRef: "patient_8f2",
    amountMinor: 12900,
    currency: "USD",
    riskScore: 82,
    occurredAt: "2026-09-09T08:00:00.000Z",
  });

  assert.deepEqual(decidePayment(event, "2026-09-09T08:00:01.000Z"), {
    eventId: event.eventId,
    paymentId: "pay_2048",
    patientRef: "patient_8f2",
    action: "manual_review",
    reason: "risk_threshold_reached",
    decidedAt: "2026-09-09T08:00:01.000Z",
  });
});
