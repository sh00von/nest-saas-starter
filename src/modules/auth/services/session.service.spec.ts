import { hashToken } from '../../../common/crypto/tokens.js';
import { parseRefreshToken } from './session.service.js';

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

describe('hashToken', () => {
  it('is deterministic and does not echo the secret', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toContain('abc');
    expect(hashToken('abc')).not.toBe(hashToken('abd'));
  });
});
