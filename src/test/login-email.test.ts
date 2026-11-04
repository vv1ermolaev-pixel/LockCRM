import { describe, expect, it } from "vitest";

import { loginEmailSchema } from "@/lib/validation";

describe("Login email", () => {
  it("trims the spaces and lowercases: «  Anna@Example.COM » becomes «anna@example.com»", () => {
    expect(loginEmailSchema.parse("  Anna@Example.COM ")).toBe("anna@example.com");
  });

  it.each(["anna@", "not-an-email", ""])("rejects «%s» with «Проверьте адрес почты»", (value) => {
    const result = loginEmailSchema.safeParse(value);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Проверьте адрес почты");
  });
});
