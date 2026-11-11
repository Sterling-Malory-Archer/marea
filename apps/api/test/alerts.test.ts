import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, describe, expect, it } from "vitest";
import { createAlerter } from "../src/lib/alerts.js";
import { createLogger } from "../src/lib/logger.js";

describe("error alerts", () => {
  const received: { text: string; content: string }[] = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c)).on("end", () => {
      received.push(JSON.parse(body));
      res.end("ok");
    });
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it("posts at most one message a minute and reports how many were held back", async () => {
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
    const alert = createAlerter(url, createLogger("silent"), "API");
    alert("GET /api/x failed");
    alert("GET /api/y failed");
    alert("GET /api/z failed");
    await new Promise((r) => setTimeout(r, 300));
    expect(received).toHaveLength(1);
    expect(received[0]!.text).toContain("MAREA API: GET /api/x failed");
    expect(received[0]!.content).toBe(received[0]!.text);
  });

  it("does nothing without a webhook and never throws when it's unreachable", async () => {
    expect(() => createAlerter(undefined, createLogger("silent"), "API")("x")).not.toThrow();
    const broken = createAlerter("http://127.0.0.1:9/nothing", createLogger("silent"), "API");
    expect(() => broken("x")).not.toThrow();
    await new Promise((r) => setTimeout(r, 200));
  });
});
