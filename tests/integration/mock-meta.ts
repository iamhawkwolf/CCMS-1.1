// A tiny stand-in for Meta's Graph API so the real HTTP code path is exercised.
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface Captured { url: string; auth: string | undefined; body: any }
type Reply = { status: number; body: unknown };

export function startMockMeta() {
  const requests: Captured[] = [];
  const queued: Reply[] = [];
  let n = 0;
  let delayMs = 0;

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      requests.push({ url: req.url ?? "", auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const reply = queued.shift() ?? { status: 200, body: { messages: [{ id: `wamid.MOCK${++n}` }] } };
      res.writeHead(reply.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(reply.body));
    });
  });

  return {
    requests,
    /** The next request gets this reply (FIFO); after that, replies are successes. */
    reply: (status: number, body: unknown) => void queued.push({ status, body }),
    setDelay: (ms: number) => void (delayMs = ms),
    reset: () => { requests.length = 0; queued.length = 0; delayMs = 0; n = 0; },
    start: () => new Promise<string>((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
