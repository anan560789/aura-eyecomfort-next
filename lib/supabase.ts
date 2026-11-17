import { createClient } from '@supabase/supabase-js';

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const configuredSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!configuredSupabaseUrl || !configuredSupabaseAnonKey) {
  throw new Error(
    '缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY 環境變數。',
  );
}

export const supabaseUrl = configuredSupabaseUrl;
export const supabaseAnonKey = configuredSupabaseAnonKey;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const lineGatewayUrl = `${supabaseUrl}/functions/v1/line-gateway`;
