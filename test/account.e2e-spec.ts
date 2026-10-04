import {
  createTestApp,
  MailOutbox,
  type TestApp,
  uniqueEmail,
} from './utils/test-app.js';

// Needs a database with migrations applied: `pnpm db:migrate` first.
describe('Email flows and account deletion (e2e)', () => {
  let t: TestApp;
  const http = () => t.http();

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.app.close();
  });

  async function register(email: string, password = 'first-password') {
    const res = await http()
      .post('/v1/auth/register')
      .set('x-token-transport', 'body')
      .send({ email, password })
      .expect(201);
    return res.body as { accessToken: string; refreshToken: string };
  }

  it('verifies the email with the emailed link, once', async () => {
    const email = uniqueEmail('verify');
    const { accessToken } = await register(email);
    const token = MailOutbox.token(await t.outbox.next(email));

    await http().post('/v1/auth/verify-email').send({ token }).expect(204);
    await http().post('/v1/auth/verify-email').send({ token }).expect(400);

    const me = await http()
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.emailVerified).toBe(true);
  });

  it('resets a forgotten password and signs out every session', async () => {
    const email = uniqueEmail('reset');
    const { refreshToken } = await register(email);
    await t.outbox.next(email); // the verification email

    // Unknown emails get the same answer.
    await http()
      .post('/v1/auth/forgot-password')
      .send({ email: uniqueEmail('nobody') })
      .expect(204);
    await http().post('/v1/auth/forgot-password').send({ email }).expect(204);
    const token = MailOutbox.token(await t.outbox.next(email));

    await http()
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'second-password' })
      .expect(204);
    await http()
      .post('/v1/auth/reset-password')
      .send({ token, newPassword: 'third-password' })
      .expect(400);

    await http().post('/v1/auth/refresh').send({ refreshToken }).expect(401);
    await http()
      .post('/v1/auth/login')
      .send({ email, password: 'first-password' })
      .expect(401);
    await http()
      .post('/v1/auth/login')
      .send({ email, password: 'second-password' })
      .expect(200);
  });

  it('deletes the account only with the right password', async () => {
    const email = uniqueEmail('delete');
    const { accessToken } = await register(email);
    const auth = `Bearer ${accessToken}`;

    await http()
      .delete('/v1/users/me')
      .set('Authorization', auth)
      .send({ password: 'wrong-password' })
      .expect(401);
    await http()
      .delete('/v1/users/me')
      .set('Authorization', auth)
      .send({ password: 'first-password' })
      .expect(204);

    await http()
      .post('/v1/auth/login')
      .send({ email, password: 'first-password' })
      .expect(401);
  });
});
