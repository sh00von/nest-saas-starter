import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Tokens are stored only as SHA-256 hashes. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
