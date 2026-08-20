import { afterEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { placesProvider } from "./index";

afterEach(() => {
  delete process.env.GOOGLE_PLACES_API_KEY;
  resetEnvCache();
});

describe("placesProvider", () => {
  it("stays dormant without a key, so nothing breaks before we buy one", () => {
    resetEnvCache();
    expect(placesProvider()).toBeNull();
  });

  it("wakes up once a key is configured", () => {
    process.env.GOOGLE_PLACES_API_KEY = "k";
    resetEnvCache();
    expect(placesProvider()?.name).toBe("google-places");
  });
});
