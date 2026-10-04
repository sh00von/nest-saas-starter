import { createTestApp, type TestApp } from './utils/test-app.js';

/** Cross-cutting behaviour: versioning, error format, request ids. */
describe('Platform (e2e)', () => {
  let t: TestApp;
  const http = () => t.http();

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('serves the API under /v1 and health without a version', async () => {
    await http().get('/health').expect(200);
    await http().get('/v1/users/me').expect(401);
    await http().get('/users/me').expect(404);
  });

  it('returns every error in the same shape, with a request id', async () => {
    const res = await http()
      .post('/v1/auth/register')
      .send({ email: 'nope', password: 'x' })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      path: '/v1/auth/register',
    });
    expect(Array.isArray(res.body.message)).toBe(true);
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('keeps a well-formed incoming request id', async () => {
    const res = await http()
      .get('/v1/nothing-here')
      .set('x-request-id', 'trace-abc-123')
      .expect(404);
    expect(res.headers['x-request-id']).toBe('trace-abc-123');
    expect(res.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      requestId: 'trace-abc-123',
    });
  });

  it('replaces a malformed incoming request id', async () => {
    const res = await http()
      .get('/health')
      .set('x-request-id', 'bad id with spaces')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
