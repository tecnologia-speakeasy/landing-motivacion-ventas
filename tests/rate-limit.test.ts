import { describe, expect, it } from "vitest";

import { createRateLimiter } from "@/app/lib/rate-limit";

describe("createRateLimiter", () => {
  it("bloquea al superar el límite y se reinicia al cambiar de ventana", () => {
    let now = 0;
    const check = createRateLimiter({ limit: 2, windowMs: 1000, now: () => now });

    expect(check("ip").ok).toBe(true);
    expect(check("ip").ok).toBe(true);
    expect(check("ip")).toMatchObject({ ok: false, remaining: 0 });
    expect(check("otra-ip").ok).toBe(true);

    now = 1000;
    expect(check("ip")).toMatchObject({ ok: true, remaining: 1 });
  });
});
