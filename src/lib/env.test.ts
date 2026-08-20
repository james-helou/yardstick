import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { env, resetEnvCache } from "./env";

beforeEach(() => resetEnvCache());
afterEach(() => resetEnvCache());

describe("env", () => {
  it("reads a valid environment", () => {
    process.env.DATABASE_URL = "postgres://localhost/x";
    expect(env().DATABASE_URL).toBe("postgres://localhost/x");
  });

  it("throws a message naming the missing variable", () => {
    delete process.env.DATABASE_URL;
    expect(() => env()).toThrow(/DATABASE_URL/);
  });

  it("does not throw merely by being imported", async () => {
    delete process.env.DATABASE_URL;
    await expect(import("./env")).resolves.toBeDefined();
  });

  it("caches after the first successful read", () => {
    process.env.DATABASE_URL = "postgres://localhost/a";
    expect(env().DATABASE_URL).toBe("postgres://localhost/a");
    process.env.DATABASE_URL = "postgres://localhost/b";
    expect(env().DATABASE_URL).toBe("postgres://localhost/a");
  });
});
