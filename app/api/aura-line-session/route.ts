import { handleAuraLineSession, type LinkDatabase } from '@/lib/aura-line-session';

export const runtime = 'edge';

type AuraBindings = {
  AURA_LINE_CHANNEL_ID?: string;
  AURA_SESSION_SECRET?: string;
  AURA_PWA_LINKS?: LinkDatabase;
};

function route(request: Request) {
  // The project's next-on-pages adapter exposes Pages bindings through this request context.
  const contextKey = Symbol.for('__cloudflare-request-context__');
  const context = (globalThis as { [key: symbol]: { env?: AuraBindings } | undefined })[contextKey];
  const env = context?.env;
  return handleAuraLineSession(request, {
    channelId: env?.AURA_LINE_CHANNEL_ID ?? process.env.AURA_LINE_CHANNEL_ID ?? '',
    secret: env?.AURA_SESSION_SECRET ?? process.env.AURA_SESSION_SECRET ?? '',
    links: env?.AURA_PWA_LINKS,
  });
}

export { route as GET, route as POST, route as DELETE };
