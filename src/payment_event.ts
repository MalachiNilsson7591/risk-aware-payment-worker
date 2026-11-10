import { z } from "zod";

export const paymentEventSchema = z.object({
  eventId: z.string().uuid(),
  paymentId: z.string().min(1).max(100),
  patientRef: z.string().min(1).max(100),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  riskScore: z.number().min(0).max(100),
  occurredAt: z.string().datetime(),
}).strict();

export type PaymentEvent = z.infer<typeof paymentEventSchema>;
export type PaymentAction = "capture" | "manual_review";

export type AuditNotification = {
  eventId: string;
  paymentId: string;
  patientRef: string;
  action: PaymentAction;
  reason: string;
  decidedAt: string;
};

export function decidePayment(event: PaymentEvent, decidedAt: string): AuditNotification {
  const review = event.riskScore >= 70;
  return {
    eventId: event.eventId,
    paymentId: event.paymentId,
    patientRef: event.patientRef,
    action: review ? "manual_review" : "capture",
    reason: review ? "risk_threshold_reached" : "risk_threshold_clear",
    decidedAt,
  };
}
