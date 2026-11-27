import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (the library default) with explicit, OWASP-aligned parameters.
const OPTS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (password: string) => hash(password, OPTS);

export async function verifyPassword(stored: string, password: string) {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

// Verified against when the email is unknown so timing does not reveal which accounts exist.
let dummy: Promise<string> | undefined;
export const dummyHash = () => (dummy ??= hashPassword("not-a-real-password-for-timing"));
