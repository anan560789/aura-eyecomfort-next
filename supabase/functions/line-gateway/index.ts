const DEFAULT_ALLOWED_ORIGINS = [
  'https://aura-eyecomfort-next.pages.dev',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

type GatewayAction = 'redeem' | 'entitlement' | 'append_log';

interface GatewayRequest {
  action?: GatewayAction;
  code?: string;
  payload?: Record<string, unknown>;
}

interface LineTokenVerification {
  client_id?: string;
  expires_in?: number;
  scope?: string;
}

interface LineProfile {
  userId?: string;
  displayName?: string;
}

function jsonResponse(
  body: Record<string, unknown> | unknown[],
  status: number,
  origin: string,
) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return new Response(JSON.stringify(body), { status, headers });
}

function getAllowedOrigins() {
  const configured = (Deno.env.get('AURA_ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function getSupabaseServerKey() {
  const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
      if (typeof parsed.default === 'string' && parsed.default) {
        return parsed.default;
      }
      const firstKey = Object.values(parsed).find(
        (value): value is string => typeof value === 'string' && value.length > 0,
      );
      if (firstKey) return firstKey;
    } catch {
      // Continue to the legacy fallback below if the injected JSON is malformed.
    }
  }

  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || null;
}

async function verifyLineIdentity(accessToken: string) {
  const expectedChannelId = Deno.env.get('LINE_CHANNEL_ID');
  if (!expectedChannelId) throw new Error('LINE_CHANNEL_ID 尚未設定');

  const verifyUrl = new URL('https://api.line.me/oauth2/v2.1/verify');
  verifyUrl.searchParams.set('access_token', accessToken);
  const verificationResponse = await fetch(verifyUrl);
  const verification = await verificationResponse.json() as LineTokenVerification;

  if (
    !verificationResponse.ok
    || verification.client_id !== expectedChannelId
    || !verification.expires_in
    || verification.expires_in <= 0
  ) {
    throw new Error('LINE 登入憑證無效或不屬於此應用程式');
  }

  const profileResponse = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await profileResponse.json() as LineProfile;

  if (!profileResponse.ok || !profile.userId || !profile.displayName) {
    throw new Error('無法向 LINE 驗證使用者身分');
  }

  return { lineUid: profile.userId, realName: profile.displayName };
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = getAllowedOrigins();

  if (origin && !allowedOrigins.has(origin)) {
    return jsonResponse({ error: '不允許的網站來源' }, 403, '');
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: '僅接受 POST 請求' }, 405, origin);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 128_000) {
    return jsonResponse({ error: '請求內容過大' }, 413, origin);
  }

  const authorization = request.headers.get('Authorization') || '';
  const accessToken = authorization.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : '';
  if (!accessToken) {
    return jsonResponse({ error: '缺少 LINE 登入憑證' }, 401, origin);
  }

  try {
    const body = await request.json() as GatewayRequest;
    const { lineUid, realName } = await verifyLineIdentity(accessToken);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serverKey = getSupabaseServerKey();
    if (!supabaseUrl || !serverKey) {
      throw new Error('Supabase 伺服器環境變數尚未就緒');
    }

    let rpcName: string;
    let rpcBody: Record<string, unknown>;

    switch (body.action) {
      case 'redeem': {
        const normalizedCode = (body.code || '').trim().toUpperCase();
        if (normalizedCode.length < 8 || normalizedCode.length > 80) {
          return jsonResponse({ error: '授權碼格式錯誤' }, 400, origin);
        }
        rpcName = 'redeem_access_code';
        rpcBody = {
          p_code: normalizedCode,
          p_line_uid: lineUid,
          p_real_name: realName,
        };
        break;
      }
      case 'entitlement':
        rpcName = 'get_active_entitlement';
        rpcBody = { p_line_uid: lineUid };
        break;
      case 'append_log':
        if (!body.payload || typeof body.payload !== 'object') {
          return jsonResponse({ error: '訓練紀錄格式錯誤' }, 400, origin);
        }
        rpcName = 'append_training_log';
        rpcBody = { p_line_uid: lineUid, p_payload: body.payload };
        break;
      default:
        return jsonResponse({ error: '不支援的操作' }, 400, origin);
    }

    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: {
        apikey: serverKey,
        Authorization: `Bearer ${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(rpcBody),
    });
    const rpcResult = await rpcResponse.json().catch(() => null);

    if (!rpcResponse.ok) {
      const message = rpcResult && typeof rpcResult === 'object'
        && 'message' in rpcResult && typeof rpcResult.message === 'string'
        ? rpcResult.message
        : '伺服器操作失敗';
      return jsonResponse({ error: message }, rpcResponse.status, origin);
    }

    return jsonResponse(
      rpcResult && typeof rpcResult === 'object' ? rpcResult : { ok: false },
      200,
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '伺服器驗證失敗';
    const status = message.startsWith('LINE ') || message.startsWith('無法向 LINE')
      ? 401
      : 500;
    return jsonResponse({ error: message }, status, origin);
  }
});
