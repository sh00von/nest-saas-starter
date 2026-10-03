import { hash, verify } from 'argon2';

// Verified against when there is no real hash, so a failed login takes the
// same time whether or not the account (or its password) exists.
const dummyHash = hash('timing-equalizer');

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

/** False when `passwordHash` is null (provider-only account) or mismatched. */
export async function verifyPassword(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  const valid = await verify(passwordHash ?? (await dummyHash), password);
  return Boolean(passwordHash) && valid;
}
