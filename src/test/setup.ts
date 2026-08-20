import { afterAll, beforeAll } from "vitest";
import { closeDb } from "@/lib/db/client";
import { migrate } from "@/lib/db/migrate";

process.env.DATABASE_URL ??= "postgres://localhost:5432/rankproof_test";
process.env.NODE_ENV = "test";

beforeAll(async () => {
  await migrate();
});

afterAll(async () => {
  await closeDb();
});
