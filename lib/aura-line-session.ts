type LineProfile = { uid: string; name: string };
type Session = { profile: LineProfile; expiresAt: number };

type Statement = {
  bind(...values: (string | number)[]): Statement;
  first<Row>(): Promise<Row | null>;
  run(): Promise<unknown>;
};

export type LinkDatabase = { prepare(sql: string): Statement };

type Options = {
  channelId: string;
  secret: string;
  links?: LinkDatabase;
};

const cookieName = '__Host-aura_line';
const sessionSeconds = 7 * 24 * 60 * 60;
const linkSeconds = 5 * 60;
const base64urlPattern = /^[A-Za-z0-9_-]{43}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function seal(key: CryptoKey, session: Session, purpose: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(purpose) },
    key,
    encoder.encode(JSON.stringify(session)),
  );
  return encode(Uint8Array.from([...iv, ...new Uint8Array(encrypted)]));
}

async function unseal(key: CryptoKey, value: string | undefined, purpose: string, now: number) {
  if (!value || value.length > 2048) return null;
  try {
    const data = decode(value);
    if (data.length <= 28) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: data.slice(0, 12), additionalData: encoder.encode(purpose) },
      key,
      data.slice(12),
    );
    const session = JSON.parse(decoder.decode(decrypted)) as Session;
    return session.expiresAt > now ? session : null;
  } catch {
    return null;
  }
}

function respond(body: object, status = 200, cookie?: string) {
  const headers = new Headers({ 'Cache-Control': 'private, no-store' });
  if (cookie !== undefined) headers.set('Set-Cookie', cookie);
  return Response.json(body, { status, headers });
}

function sessionCookie(value: string, seconds: number) {
  return `${cookieName}=${value}; Max-Age=${seconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

function readCookie(request: Request) {
  const prefix = `${cookieName}=`;
  return request.headers.get('cookie')?.split(';').map(item => item.trim())
    .find(item => item.startsWith(prefix))?.slice(prefix.length);
}

async function readLineProfile(token: string, channelId: string) {
  const verifyUrl = new URL('https://api.line.me/oauth2/v2.1/verify');
  verifyUrl.searchParams.set('access_token', token);
  const verification = await fetch(verifyUrl, { redirect: 'manual' });
  if (!verification.ok) return null;
  const info = await verification.json() as { client_id?: string; expires_in?: number };
  if (info.client_id !== channelId || !(typeof info.expires_in === 'number' && info.expires_in > 0)) return null;

  const result = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'manual',
  });
  if (!result.ok) return null;
  const profile = await result.json() as { userId?: string; displayName?: string };
  if (typeof profile.userId !== 'string' || !/^U[0-9a-f]{32}$/i.test(profile.userId) ||
      typeof profile.displayName !== 'string' || profile.displayName.length > 100) return null;
  return { uid: profile.userId, name: profile.displayName };
}

async function signIn(key: CryptoKey, profile: LineProfile, now: number) {
  const cookie = await seal(key, { profile, expiresAt: now + sessionSeconds }, cookieName);
  return respond({ profile }, 200, sessionCookie(cookie, sessionSeconds));
}

export async function handleAuraLineSession(request: Request, options: Options) {
  if (request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(request.url).origin) {
    return respond({ error: 'origin' }, 403);
  }

  if (request.method === 'DELETE') return respond({}, 200, sessionCookie('', 0));
  if (!/^\d+$/.test(options.channelId) || !base64urlPattern.test(options.secret)) {
    return respond({ error: 'unconfigured' }, 503);
  }

  try {
    const key = await crypto.subtle.importKey('raw', decode(options.secret), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    const now = Math.floor(Date.now() / 1000);
    const cookie = readCookie(request);
    if (request.method === 'GET') {
      const session = await unseal(key, cookie, cookieName, now);
      return respond({ profile: session?.profile ?? null });
    }

    if (request.method !== 'POST' || !request.headers.get('content-type')?.startsWith('application/json')) {
      return respond({ error: 'request' }, 400);
    }

    const raw = await request.text();
    if (raw.length > 4096) return respond({ error: 'request' }, 400);
    const body = JSON.parse(raw) as { action?: unknown; token?: unknown; challenge?: unknown; proof?: unknown; expectedUid?: unknown } | null;
    if (!body || typeof body !== 'object') return respond({ error: 'request' }, 400);

    if (body.action === 'login' || body.action === 'approve') {
      if (body.action === 'approve' &&
          (typeof body.challenge !== 'string' || !base64urlPattern.test(body.challenge))) {
        return respond({ error: 'challenge' }, 400);
      }
      const token = body.token;
      const profile = typeof token === 'string' && token.length > 0 && token.length < 2048
        ? await readLineProfile(token, options.channelId)
        : body.action === 'approve' ? (await unseal(key, cookie, cookieName, now))?.profile : null;
      if (!profile) return respond({ error: 'line-login' }, 401);
      if (body.action === 'login') return signIn(key, profile, now);

      if (body.expectedUid !== profile.uid) return respond({ error: 'account-changed' }, 403);
      if (!options.links) return respond({ error: 'unconfigured' }, 503);
      const challenge = body.challenge as string;
      const expiresAt = now + linkSeconds;
      const sealed = await seal(key, { profile, expiresAt }, challenge);
      await options.links.prepare('DELETE FROM aura_pwa_links WHERE expires_at <= ?').bind(now).run();
      const saved = await options.links.prepare(
        'INSERT INTO aura_pwa_links (challenge, sealed_profile, expires_at) VALUES (?, ?, ?) ON CONFLICT(challenge) DO NOTHING RETURNING challenge',
      ).bind(challenge, sealed, expiresAt).first<{ challenge: string }>();
      if (!saved) {
        const prior = await options.links.prepare(
          'SELECT sealed_profile FROM aura_pwa_links WHERE challenge = ? AND expires_at > ?',
        ).bind(challenge, now).first<{ sealed_profile: string }>();
        const existing = await unseal(key, prior?.sealed_profile, challenge, now);
        if (existing?.profile.uid !== profile.uid) return respond({ error: 'link-conflict' }, 403);
      }
      return respond({ approved: true });
    }

    if (body.action === 'claim') {
      if (typeof body.proof !== 'string' || !base64urlPattern.test(body.proof)) {
        return respond({ error: 'proof' }, 400);
      }
      if (!options.links) return respond({ error: 'unconfigured' }, 503);
      const digest = await crypto.subtle.digest('SHA-256', decode(body.proof));
      const challenge = encode(new Uint8Array(digest));
      const row = await options.links.prepare(
        'DELETE FROM aura_pwa_links WHERE challenge = ? AND expires_at > ? RETURNING sealed_profile',
      ).bind(challenge, now).first<{ sealed_profile: string }>();
      if (!row) return respond({ pending: true }, 202);
      const session = await unseal(key, row.sealed_profile, challenge, now);
      if (!session) return respond({ error: 'link' }, 410);
      return signIn(key, session.profile, now);
    }

    return respond({ error: 'request' }, 400);
  } catch (error) {
    if (error instanceof SyntaxError) return respond({ error: 'request' }, 400);
    return respond({ error: 'unavailable' }, 503);
  }
}
