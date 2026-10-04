import { S3Client } from '@aws-sdk/client-s3';
import { S3 } from '../src/modules/files/s3.provider.js';
import {
  createTestApp,
  registerUser,
  type TestApp,
  uniqueEmail,
} from './utils/test-app.js';

/**
 * A real S3Client (so presigned URLs are genuinely signed) whose network
 * calls are answered from memory.
 */
function fakeS3() {
  const objects = new Map<string, { size: number; type: string }>();
  const client = new S3Client({
    region: 'us-east-1',
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  });
  client.send = ((command: {
    constructor: { name: string };
    input: { Key: string };
  }) => {
    const { Key } = command.input;
    switch (command.constructor.name) {
      case 'HeadObjectCommand': {
        const object = objects.get(Key);
        if (!object) return Promise.reject(new Error('NotFound'));
        return Promise.resolve({
          ContentLength: object.size,
          ContentType: object.type,
        });
      }
      case 'DeleteObjectCommand':
        objects.delete(Key);
        return Promise.resolve({});
      default:
        return Promise.reject(new Error(command.constructor.name));
    }
  }) as S3Client['send'];
  return { client, objects };
}

describe('Files (e2e)', () => {
  let t: TestApp;
  const http = () => t.http();
  const s3 = fakeS3();

  beforeAll(async () => {
    t = await createTestApp({
      env: { S3_BUCKET: 'test-bucket' },
      overrides: [[S3, s3.client]],
    });
  });

  afterAll(async () => {
    await t.app.close();
  });

  it('uploads, lists, downloads and deletes a file', async () => {
    const { accessToken } = await registerUser(t, uniqueEmail('files'));
    const auth = `Bearer ${accessToken}`;

    const upload = await http()
      .post('/v1/files')
      .set('Authorization', auth)
      .send({
        filename: 'résumé.pdf',
        contentType: 'application/pdf',
        size: 1234,
      })
      .expect(201);
    expect(upload.body.uploadUrl).toContain('test-bucket');
    expect(upload.body.uploadUrl).toContain('X-Amz-Signature=');
    expect(upload.body.file.status).toBe('pending');
    const id = upload.body.file.id;

    // Not in S3 yet.
    await http()
      .post(`/v1/files/${id}/complete`)
      .set('Authorization', auth)
      .expect(400);

    // Simulate the browser's PUT to the presigned URL.
    const key = new URL(upload.body.uploadUrl).pathname
      .split('/')
      .slice(-3)
      .join('/');
    s3.objects.set(key, { size: 1234, type: 'application/pdf' });

    const done = await http()
      .post(`/v1/files/${id}/complete`)
      .set('Authorization', auth)
      .expect(200);
    expect(done.body.status).toBe('uploaded');

    const list = await http()
      .get('/v1/files')
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.map((f: { id: string }) => f.id)).toContain(id);

    const download = await http()
      .get(`/v1/files/${id}/download`)
      .set('Authorization', auth)
      .expect(200);
    expect(decodeURIComponent(download.body.url)).toContain(
      "filename*=UTF-8''r%C3%A9sum%C3%A9.pdf",
    );

    await http()
      .delete(`/v1/files/${id}`)
      .set('Authorization', auth)
      .expect(204);
    expect(s3.objects.has(key)).toBe(false);
  });

  it('rejects disallowed types and sizes', async () => {
    const { accessToken } = await registerUser(t, uniqueEmail('files-bad'));
    const auth = `Bearer ${accessToken}`;
    await http()
      .post('/v1/files')
      .set('Authorization', auth)
      .send({
        filename: 'x.exe',
        contentType: 'application/x-msdownload',
        size: 10,
      })
      .expect(400);
    await http()
      .post('/v1/files')
      .set('Authorization', auth)
      .send({ filename: 'big.png', contentType: 'image/png', size: 1e9 })
      .expect(400);
  });

  it("hides other users' files", async () => {
    const owner = await registerUser(t, uniqueEmail('owner'));
    const other = await registerUser(t, uniqueEmail('other'));
    const upload = await http()
      .post('/v1/files')
      .set('Authorization', `Bearer ${owner.accessToken}`)
      .send({ filename: 'a.png', contentType: 'image/png', size: 5 })
      .expect(201);
    await http()
      .get(`/v1/files/${upload.body.file.id}/download`)
      .set('Authorization', `Bearer ${other.accessToken}`)
      .expect(404);
  });

  it('removes S3 objects when the account is deleted', async () => {
    const user = await registerUser(t, uniqueEmail('files-delete'));
    const auth = `Bearer ${user.accessToken}`;
    const upload = await http()
      .post('/v1/files')
      .set('Authorization', auth)
      .send({ filename: 'a.png', contentType: 'image/png', size: 5 })
      .expect(201);
    const key = new URL(upload.body.uploadUrl).pathname
      .split('/')
      .slice(-3)
      .join('/');
    s3.objects.set(key, { size: 5, type: 'image/png' });
    await http()
      .post(`/v1/files/${upload.body.file.id}/complete`)
      .set('Authorization', auth)
      .expect(200);

    await http()
      .delete('/v1/users/me')
      .set('Authorization', auth)
      .send({ password: 'first-password' })
      .expect(204);
    expect(s3.objects.has(key)).toBe(false);
  });
});
