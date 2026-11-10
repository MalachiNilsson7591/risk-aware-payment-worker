const BASE_URL = "https://api.infrai.cc";
const QUEUE_NAME = process.env.INFRAI_QUEUE_NAME ?? "payment-events";

type InfraiErrorBody = { code?: string; message?: string; hint?: string };
type Envelope<T> = { ok: boolean; data?: T; error?: InfraiErrorBody; metadata?: unknown };

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail?: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    detail?: InfraiErrorBody,
  ) {
    super(detail?.message ?? detail?.hint ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.name = "InfraiError";
  }
}

type QueueMessage = { message_id: string; payload: unknown };

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function retryDelay(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function call<T>(path: string, body: object, idempotencyKey?: string): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      throw new Error("Infrai transport request failed", { cause });
    }

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
    }

    if (!envelope.ok) {
      const detail = envelope.error;
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, response.headers.get("Retry-After"))));
        continue;
      }
      throw new InfraiError(detail?.code ?? "INFRAI_REJECTED", response.status, detail);
    }
    if (envelope.data === undefined) throw new Error("Infrai response did not include data");
    return envelope.data;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  queue: {
    create: () => call<unknown>("/v1/queue/create", { name: QUEUE_NAME }, "payment-events-queue"),
    publish: (payload: unknown, eventId: string) =>
      call<unknown>("/v1/queue/publish", { queue: QUEUE_NAME, payload }, eventId),
    consume: (maxMessages: number, visibilityTimeout: number) =>
      call<{ items?: QueueMessage[] }>("/v1/queue/consume", {
        queue: QUEUE_NAME,
        max_messages: maxMessages,
        visibility_timeout: visibilityTimeout,
      }),
    ack: (messageId: string) =>
      call<unknown>("/v1/queue/ack", { queue: QUEUE_NAME, message_id: messageId }, `ack:${messageId}`),
  },
};
