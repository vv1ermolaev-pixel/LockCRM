import { describe, expect, it } from "vitest";

import { loginEmailSchema, passwordSchema } from "@/lib/validation";

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

describe("A new password", () => {
  it("rejects 7 characters with «Пароль должен быть не короче 8 символов»", () => {
    const result = passwordSchema.safeParse("a".repeat(7));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Пароль должен быть не короче 8 символов");
  });

  it.each([8, 128])("accepts %i characters", (length) => {
    expect(passwordSchema.safeParse("a".repeat(length)).success).toBe(true);
  });

  it("rejects 129 characters with «Пароль должен быть не длиннее 128 символов»", () => {
    const result = passwordSchema.safeParse("a".repeat(129));

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("Пароль должен быть не длиннее 128 символов");
  });

  it("keeps the spaces: they are a part of the password", () => {
    expect(passwordSchema.parse(" длинная фраза ")).toBe(" длинная фраза ");
  });

  it("does not count spaces out of the length", () => {
    expect(passwordSchema.safeParse("        ").success).toBe(true);
  });
});
