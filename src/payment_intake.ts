import { createServer, type ServerResponse } from "node:http";
import { paymentEventSchema } from "./payment_event.ts";
import { InfraiError, infrai } from "./infrai_queue.ts";

function reply(response: ServerResponse, status: number, body: object): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/payments") {
    reply(response, 404, { error: "not_found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = paymentEventSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      reply(response, 400, { error: "invalid_payment_event", issues: parsed.error.issues });
      return;
    }
    await infrai.queue.publish(parsed.data, parsed.data.eventId);
    reply(response, 202, { eventId: parsed.data.eventId, state: "queued" });
  } catch (error) {
    if (error instanceof SyntaxError) {
      reply(response, 400, { error: "invalid_json" });
    } else if (error instanceof InfraiError && error.status < 500) {
      reply(response, error.status, { error: error.code, message: error.message });
    } else {
      console.error(error);
      reply(response, 502, { error: "queue_unavailable" });
    }
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`payment intake listening on http://localhost:${port}`));
