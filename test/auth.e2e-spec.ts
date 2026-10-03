import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/setup-app.js';

// Needs a database with migrations applied: `pnpm db:migrate` first.
describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'correct-horse-battery';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('rejects protected routes without a token', () =>
    http().get('/users/me').expect(401));

  it('validates the register payload', () =>
    http()
      .post('/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400));

  it('runs the full register → refresh → logout flow', async () => {
    const registered = await http()
      .post('/auth/register')
      .set('x-token-transport', 'body')
      .send({ email, password, name: 'E2E' })
      .expect(201);
    expect(registered.body.user.email).toBe(email);
    expect(registered.headers['set-cookie']?.[0]).toMatch(
      /^refresh_token=.*HttpOnly/,
    );
    const { accessToken, refreshToken } = registered.body;

    await http().post('/auth/register').send({ email, password }).expect(409);

    const me = await http()
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body).not.toHaveProperty('passwordHash');

    // Refresh token is rotated...
    const refreshed = await http()
      .post('/auth/refresh')
      .set('x-token-transport', 'body')
      .send({ refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    // ...and replaying the old one revokes the session, new token included.
    await http().post('/auth/refresh').send({ refreshToken }).expect(401);
    await http()
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('logs in, without leaking the refresh token to browsers', async () => {
    const login = await http()
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    expect(login.body.refreshToken).toBeUndefined();

    // The cookie alone is enough to refresh.
    const cookie = login.headers['set-cookie']![0].split(';')[0];
    await http().post('/auth/refresh').set('Cookie', cookie).expect(200);

    const auth = `Bearer ${login.body.accessToken}`;
    const sessions = await http()
      .get('/auth/sessions')
      .set('Authorization', auth)
      .expect(200);
    expect(sessions.body.some((s: { current: boolean }) => s.current)).toBe(
      true,
    );

    await http().post('/auth/logout').set('Authorization', auth).expect(204);
    await http().post('/auth/refresh').set('Cookie', cookie).expect(401);
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
  });
});
