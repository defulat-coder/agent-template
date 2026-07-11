import type { PassThrough } from "node:stream";
import type { FastifyReply } from "fastify";

export function sendEventStream(reply: FastifyReply, stream: PassThrough) {
  return reply
    .header("Cache-Control", "no-cache, no-transform")
    .header("Connection", "keep-alive")
    .header("Content-Type", "text/event-stream; charset=utf-8")
    .header("X-Accel-Buffering", "no")
    .send(stream);
}

export function writeSseEvent(
  stream: PassThrough,
  event: string,
  data: unknown,
  id?: string,
) {
  if (stream.destroyed) return;
  if (id) stream.write(`id: ${id}\n`);
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}
