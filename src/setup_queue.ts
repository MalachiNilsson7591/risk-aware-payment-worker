import { infrai } from "./infrai_queue.ts";

await infrai.queue.create();
console.log(JSON.stringify({ state: "queue_ready" }));
