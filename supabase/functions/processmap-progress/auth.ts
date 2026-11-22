import { jwtVerify, type JWTVerifyGetKey } from 'npm:jose@6.2.18';
import { ISSUER, READER_ROLE, RESOURCE, UUID } from './handler.ts';

export function authenticateOAuth(keys: JWTVerifyGetKey, lookupSubject: (token: string) => Promise<string | null>) {
  return async (token: string) => {
    const { payload } = await jwtVerify(token, keys, {
      algorithms: ['ES256'],
      issuer: ISSUER,
      audience: RESOURCE,
      requiredClaims: ['sub', 'exp', 'iat', 'client_id', 'session_id'],
    });
    if (payload.aud !== RESOURCE || payload.role !== READER_ROLE ||
      typeof payload.client_id !== 'string' || !UUID.test(payload.client_id) ||
      typeof payload.session_id !== 'string' || !UUID.test(payload.session_id) ||
      typeof payload.sub !== 'string' || !UUID.test(payload.sub) || payload.is_anonymous === true) return null;
    return await lookupSubject(token) === payload.sub ? payload.sub : null;
  };
}
