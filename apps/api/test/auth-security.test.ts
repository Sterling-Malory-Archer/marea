import { describe, expect, it } from "vitest";
import supertest from "supertest";
import { app, createStaff, db, loginAs, ORIGIN, request } from "./helpers.js";

describe("foundation", () => {
  it("health check reaches MySQL 8", async () => {
    const res = await request().get("/health");
    expect(res.status).toBe(200);
    expect(res.body.database.version).toMatch(/^8\./);
  });

  it("returns JSON 404s and security headers", async () => {
    const res = await request().get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  it("uses InnoDB for every table", async () => {
    const rows = await db.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND ENGINE <> 'InnoDB'`;
    expect(Number(rows[0]!.n)).toBe(0);
  });
});

describe("admin authentication", () => {
  it("logs in, exposes /me with permissions, and logs out", async () => {
    const { agent, user } = await loginAs("CATALOG_MANAGER");
    const me = await agent.get("/api/admin/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(user.id);
    expect(me.body.user.passwordHash).toBeUndefined();
    expect(me.body.permissions).toContain("catalog:write");
    expect(me.body.permissions).not.toContain("admins:manage");

    expect((await agent.post("/api/admin/auth/logout")).status).toBe(204);
    expect((await agent.get("/api/admin/auth/me")).status).toBe(401);
  });

  it("stores only hashed session tokens and sets a hardened cookie", async () => {
    const { email, password } = await createStaff("ADMIN");
    const res = await request().post("/api/admin/auth/login").set("Origin", ORIGIN).send({ email, password });
    const cookie = String(res.headers["set-cookie"]);
    expect(cookie).toMatch(/marea_admin=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    const token = /marea_admin=([^;]+)/.exec(cookie)![1]!;
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0);
  });

  it("rejects wrong passwords with a generic message and locks after 5 failures", async () => {
    const { email, password } = await createStaff("ADMIN");
    const login = (pw: string) => request().post("/api/admin/auth/login").set("Origin", ORIGIN).send({ email, password: pw });
    for (let i = 0; i < 5; i++) {
      const r = await login("wrong-password-1");
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe("Incorrect e-mail or password");
    }
    expect((await login(password)).status).toBe(423);
  });

  it("does not let customers into the admin area", async () => {
    const { email, password } = await createStaff("CUSTOMER");
    const r = await request().post("/api/admin/auth/login").set("Origin", ORIGIN).send({ email, password });
    expect(r.status).toBe(401);
  });

  it("rejects unknown e-mails identically", async () => {
    const r = await request().post("/api/admin/auth/login").set("Origin", ORIGIN).send({ email: "ghost@test.local", password: "whatever-123" });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe("Incorrect e-mail or password");
  });
});

describe("CSRF origin protection", () => {
  it("blocks state-changing requests without a trusted Origin", async () => {
    const { email, password } = await createStaff("ADMIN");
    expect((await supertest(app).post("/api/admin/auth/login").send({ email, password })).status).toBe(403);
    expect((await supertest(app).post("/api/admin/auth/login").set("Origin", "https://evil.example").send({ email, password })).status).toBe(403);
  });
});

describe("role-based access control", () => {
  it("requires a session for admin routes", async () => {
    expect((await request().get("/api/admin/products")).status).toBe(401);
  });

  it("lets content editors read but not write the catalogue", async () => {
    const { agent } = await loginAs("CONTENT_EDITOR");
    expect((await agent.get("/api/admin/products")).status).toBe(200);
    expect((await agent.post("/api/admin/brands").send({ name: "Nope" })).status).toBe(403);
  });

  it("lets order managers adjust stock but not edit products", async () => {
    const { agent } = await loginAs("ORDER_MANAGER");
    expect((await agent.post("/api/admin/colors").send({ name: "Nope", hex: "#000000" })).status).toBe(403);
  });
});
