import type { Request } from 'express';
import type { SessionMeta } from '../services/session.service.js';

/** Rate limit for endpoints attackers would brute-force or spam. */
export const STRICT_LIMIT = { default: { limit: 5, ttl: 60_000 } };

/** Device info stored with a session, shown in "active sessions". */
export function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
