import { createRemoteJWKSet } from 'npm:jose@6.2.18';
import { authenticateOAuth } from './auth.ts';
import { createHandler, ISSUER, PROJECT_URL, UUID } from './handler.ts';

const jwks = createRemoteJWKSet(new URL(ISSUER + '/.well-known/jwks.json'));
const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(createHandler({
  authenticate: authenticateOAuth(jwks, async token => {
    // Supabase validates the OAuth session at its UserInfo endpoint, including a revoked session.
    const response = await fetch(ISSUER + '/oauth/userinfo', {
      headers: { apikey: apiKey, Authorization: 'Bearer ' + token },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const account = await response.json();
    return typeof account.sub === 'string' ? account.sub : null;
  }),
  async read(userId) {
    if (!serviceKey || !UUID.test(userId)) throw new Error();
    // The service credential stays inside the Edge Function. This is its only data query.
    const url = new URL(PROJECT_URL + '/rest/v1/processmap_documents');
    url.search = new URLSearchParams({
      select: 'document,revision,updated_at',
      user_id: 'eq.' + userId,
      limit: '1',
    }).toString();
    const response = await fetch(url, {
      method: 'GET',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) throw new Error();
    const rows = await response.json();
    return rows[0] ?? null;
  },
}));
