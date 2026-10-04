import {
  createTestApp,
  registerUser,
  type TestApp,
  uniqueEmail,
} from './utils/test-app.js';

// Needs the seeded admin: `pnpm db:seed` with SEED_ADMIN_EMAIL/PASSWORD.
describe('Admin user management (e2e)', () => {
  let t: TestApp;
  const http = () => t.http();
  let admin: string;
  let adminId: string;

  beforeAll(async () => {
    t = await createTestApp();
    const login = await http()
      .post('/v1/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL,
        password: process.env.SEED_ADMIN_PASSWORD,
      })
      .expect(200);
    admin = `Bearer ${login.body.accessToken}`;
    adminId = login.body.user.id;
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('is admin-only', async () => {
    const user = await registerUser(t, uniqueEmail('plain'));
    await http()
      .get('/v1/admin/users')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
    const list = await http()
      .get('/v1/admin/users?limit=5')
      .set('Authorization', admin)
      .expect(200);
    expect(list.body).toMatchObject({ page: 1, limit: 5 });
  });

  it('changes roles, applied at the next refresh', async () => {
    const user = await registerUser(t, uniqueEmail('promote'));
    await http()
      .patch(`/v1/admin/users/${user.user.id}/role`)
      .set('Authorization', admin)
      .send({ role: 'admin' })
      .expect(200);

    const refreshed = await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    expect(refreshed.body.user.role).toBe('admin');
    await http()
      .get('/v1/admin/users')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
  });

  it('bans: ends sessions and blocks login until unbanned', async () => {
    const email = uniqueEmail('ban');
    const user = await registerUser(t, email);

    const banned = await http()
      .post(`/v1/admin/users/${user.user.id}/ban`)
      .set('Authorization', admin)
      .expect(200);
    expect(banned.body.banned).toBe(true);

    await http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
    await http()
      .post('/v1/auth/login')
      .send({ email, password: 'first-password' })
      .expect(403);

    await http()
      .post(`/v1/admin/users/${user.user.id}/unban`)
      .set('Authorization', admin)
      .expect(200);
    await http()
      .post('/v1/auth/login')
      .send({ email, password: 'first-password' })
      .expect(200);
  });

  it('stops admins from locking themselves out', async () => {
    await http()
      .post(`/v1/admin/users/${adminId}/ban`)
      .set('Authorization', admin)
      .expect(400);
    await http()
      .patch(`/v1/admin/users/${adminId}/role`)
      .set('Authorization', admin)
      .send({ role: 'user' })
      .expect(400);
  });
});
