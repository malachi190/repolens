import { describe, expect, it } from "vitest";

import { createApp, healthStatus } from "./app.js";

describe("Express API", () => {
  it("reports service health", async () => {
    expect(createApp()).toBeDefined();
    expect(healthStatus()).toEqual({ status: "ok", service: "repolens-api" });
  });
});
