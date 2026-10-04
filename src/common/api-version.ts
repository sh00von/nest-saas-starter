/**
 * Current API version: every route is served under `/v1/...` (see
 * setup-app.ts). Routes that must keep a fixed URL (health checks, Stripe
 * webhook) opt out with `version: VERSION_NEUTRAL`.
 */
export const API_VERSION = '1';

/** Prefix for absolute paths (cookie paths, redirect URIs). */
export const API_PREFIX = `/v${API_VERSION}`;
