import { randomBytes, scryptSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/lib/password-hash";

const PASSWORD = "длинная фраза для входа";

describe("The hash of a password", () => {
  it("starts with the parameters of the calculation and does not hold the password", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(hash.startsWith("scrypt$131072$8$1$")).toBe(true);
    expect(hash).not.toContain(PASSWORD);
    expect(hash).not.toContain(Buffer.from(PASSWORD).toString("base64url"));
  });

  it("differs for the same password: every hash has a salt of its own", async () => {
    expect(await hashPassword(PASSWORD)).not.toBe(await hashPassword(PASSWORD));
  });

  it("lets the right password through and not a wrong one", async () => {
    const hash = await hashPassword(PASSWORD);

    expect(await verifyPassword({ hash, password: PASSWORD })).toBe(true);
    expect(await verifyPassword({ hash, password: `${PASSWORD}!` })).toBe(false);
  });

  it("treats one string in different Unicode forms as the same password", async () => {
    const composed = "пароль-йёжик-é".normalize("NFC");
    const decomposed = composed.normalize("NFD");
    expect(decomposed).not.toBe(composed);

    const hash = await hashPassword(composed);

    expect(await verifyPassword({ hash, password: decomposed })).toBe(true);
  });

  it("counts the spaces at the edges as a part of the password", async () => {
    const hash = await hashPassword(" длинная фраза ");

    expect(await verifyPassword({ hash, password: " длинная фраза " })).toBe(true);
    expect(await verifyPassword({ hash, password: "длинная фраза" })).toBe(false);
  });

  it.each([
    ["an empty string", ""],
    ["text that is no hash", "not-a-hash"],
    ["another algorithm", "bcrypt$131072$8$1$c2FsdA$a2V5"],
    ["too few parts", "scrypt$131072$8$1$c2FsdA"],
    ["parameters that are no numbers", "scrypt$many$8$1$c2FsdA$a2V5"],
    ["parameters that cannot be calculated", "scrypt$3$8$1$c2FsdA$a2V5"],
    ["an empty key", "scrypt$131072$8$1$c2FsdA$"],
  ])("answers false, not an error, for %s", async (_, hash) => {
    expect(await verifyPassword({ hash, password: PASSWORD })).toBe(false);
  });

  it("still checks a hash made with other parameters: N=2^15, r=8, p=3", async () => {
    const salt = randomBytes(16);
    const key = scryptSync(PASSWORD.normalize("NFKC"), salt, 32, {
      N: 2 ** 15,
      r: 8,
      p: 3,
      maxmem: 64 * 1024 * 1024,
    });
    const hash = `scrypt$${2 ** 15}$8$3$${salt.toString("base64url")}$${key.toString("base64url")}`;

    expect(await verifyPassword({ hash, password: PASSWORD })).toBe(true);
    expect(await verifyPassword({ hash, password: "другой пароль" })).toBe(false);
  });
});
