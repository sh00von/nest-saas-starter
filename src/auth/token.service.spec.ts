import { hashSecret, parseRefreshToken } from './token.service.js';

describe('parseRefreshToken', () => {
  const id = '3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b';

  it('splits a well-formed token', () => {
    expect(parseRefreshToken(`${id}.s3cr3t`)).toEqual({
      sessionId: id,
      secret: 's3cr3t',
    });
  });

  it.each([
    ['empty', ''],
    ['no secret', `${id}.`],
    ['no separator', id],
    ['not a uuid', 'abc.s3cr3t'],
    ['extra segment', `${id}.a.b`],
  ])('rejects %s', (_label, token) => {
    expect(parseRefreshToken(token)).toBeNull();
  });
});

describe('hashSecret', () => {
  it('is deterministic and does not echo the secret', () => {
    expect(hashSecret('abc')).toBe(hashSecret('abc'));
    expect(hashSecret('abc')).not.toContain('abc');
    expect(hashSecret('abc')).not.toBe(hashSecret('abd'));
  });
});
