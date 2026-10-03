import {
  cookieFrom,
  createTestApp,
  type TestApp,
  uniqueEmail,
} from './utils/test-app.js';

// Needs a database with migrations applied: `pnpm db:migrate` first.
describe('Auth (e2e)', () => {
  let t: TestApp;
  const http = () => t.http();
  const email = uniqueEmail('auth');
  const password = 'correct-horse-battery';

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('rejects protected routes without a token', () =>
    http().get('/users/me').expect(401));

  it('validates the register payload', () =>
    http()
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400));

  it('rejects form posts to cookie-setting routes (login CSRF)', () =>
    http()
      .post('/auth/login')
      .type('form')
      .send({ email, password })
      .expect(415));

  it('runs register, refresh and replay detection with body tokens', async () => {
    const registered = await http()
      .post('/auth/register')
      .set('x-token-transport', 'body')
      .send({ email, password, name: 'E2E' })
      .expect(201);
    expect(registered.body.user).toMatchObject({
      email,
      emailVerified: false,
      hasPassword: true,
    });
    // Body transport: no cookie is set.
    expect(registered.headers['set-cookie']).toBeUndefined();
    const { accessToken, refreshToken } = registered.body;

    await http().post('/auth/register').send({ email, password }).expect(409);

    const me = await http()
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).not.toHaveProperty('passwordHash');

    const refreshed = await http()
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).toBeDefined();
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    // Replaying the old token revokes the session, new token included.
    await http().post('/auth/refresh').send({ refreshToken }).expect(401);
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('keeps cookie sessions in the cookie', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.body.refreshToken).toBeUndefined();
    expect(login.headers['set-cookie']?.[0]).toMatch(/HttpOnly/);
    const cookie = cookieFrom(login);

    // A script asking for the token in the body still only gets a cookie.
    const refreshed = await http()
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .set('x-token-transport', 'body')
      .type('json')
      .expect(200);
    expect(refreshed.body.refreshToken).toBeUndefined();
    const newCookie = cookieFrom(refreshed);

    // A bodiless cross-site POST (no JSON content type) is refused.
    await http().post('/auth/refresh').set('Cookie', newCookie).expect(415);

    const auth = `Bearer ${login.body.accessToken}`;
    const sessions = await http()
      .get('/auth/sessions')
      .set('Authorization', auth)
      .expect(200);
    expect(sessions.body.some((s: { current: boolean }) => s.current)).toBe(
      true,
    );

    await http().post('/auth/logout').set('Authorization', auth).expect(204);
    await http()
      .post('/auth/refresh')
      .set('Cookie', newCookie)
      .type('json')
      .expect(401);
  });

  it('rejects a wrong password', () =>
    http()
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401));

  it('keeps admin routes for admins', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    await http()
      .get('/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(403);
  });

  it('serves health and the OpenAPI spec', async () => {
    await http().get('/health/ready').expect(200);
    const spec = await http().get('/openapi.json').expect(200);
    expect(spec.body.paths).toHaveProperty('/auth/login');
    // Optional modules stay off without configuration.
    expect(spec.body.paths).not.toHaveProperty('/auth/google');
  });
});
