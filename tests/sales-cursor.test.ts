import { describe, expect, it } from "vitest";

import { INITIAL_CURSOR, parseCursor } from "@/app/lib/sales-cursor";

describe("parseCursor", () => {
  const id = "79e47346-0188-4aa8-b706-818b68442866";

  it("acepta el formato que genera la API", () => {
    expect(parseCursor(`2026-09-30T19:45:41.416123Z|${id}`)).toEqual({
      createdAt: "2026-09-30T19:45:41.416123Z",
      id,
    });
  });

  it("el cursor inicial (programa sin compras) es válido", () => {
    expect(parseCursor(INITIAL_CURSOR)).not.toBeNull();
  });

  it("rechaza cursores sin microsegundos, sin id o con contenido extra", () => {
    expect(parseCursor(`2026-09-30T19:45:41.416Z|${id}`)).toBeNull();
    expect(parseCursor("2026-09-30T19:45:41.416123Z")).toBeNull();
    expect(parseCursor(`2026-09-30T19:45:41.416123Z|${id}' OR 1=1`)).toBeNull();
  });
});
