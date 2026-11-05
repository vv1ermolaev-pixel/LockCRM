import "server-only";

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// The main recommendation of the OWASP Password Storage Cheat Sheet. They are written into every hash,
// so they can change later and the passwords saved before keep working
const COST = 2 ** 17;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;

const ALGORITHM = "scrypt";
const SEPARATOR = "$";

function deriveKey(password: string, salt: Buffer, keyBytes: number, N: number, r: number, p: number) {
  // The default memory limit of Node is lower than what these parameters take
  const options: ScryptOptions = { N, r, p, maxmem: 2 * 128 * N * r };
  return new Promise<Buffer>((resolve, reject) => {
    // In the thread pool of Node: the server keeps answering others meanwhile.
    // NFKC: the same password typed on different devices gives the same bytes
    scrypt(password.normalize("NFKC"), salt, keyBytes, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt, KEY_BYTES, COST, BLOCK_SIZE, PARALLELIZATION);
  return [ALGORITHM, COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), key.toString("base64url")].join(
    SEPARATOR,
  );
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }) {
  const [algorithm, N, r, p, salt, key, ...rest] = hash.split(SEPARATOR);
  if (algorithm !== ALGORITHM || !key || rest.length > 0) return false;

  const expected = Buffer.from(key, "base64url");
  if (expected.length === 0) return false;

  try {
    const actual = await deriveKey(
      password,
      Buffer.from(salt, "base64url"),
      expected.length,
      Number(N),
      Number(r),
      Number(p),
    );
    return timingSafeEqual(actual, expected);
  } catch {
    // Parameters that cannot be calculated: a damaged string lets nobody in and is not an error of the request
    return false;
  }
}
