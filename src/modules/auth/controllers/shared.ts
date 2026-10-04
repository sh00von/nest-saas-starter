import type { Request } from 'express';
import type { SessionMeta } from '../services/session.service.js';

/** Device info stored with a session, shown in "active sessions". */
export function sessionMeta(req: Request): SessionMeta {
  return { userAgent: req.headers['user-agent'], ip: req.ip };
}
