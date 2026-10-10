// Server-side Supabase client with service role key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith('sb_publishable_') || value.startsWith('sb_secret_');
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(
      typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    // New Supabase API keys are opaque strings, not bearer JWTs.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get('Authorization') === `Bearer ${supabaseKey}`) {
      headers.delete('Authorization');
    }

    headers.set('apikey', supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function createSupabaseAdminClient() {
  const SUPABASE_URL = (
    process.env['VITE_SUPABASE_URL'] ||
    process.env['SUPABASE_URL'] ||
    ''
  ).replace(/^["']|["']$/g, '').trim();

  const serviceRoleKey = (
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ||
    process.env['SUPABASE_SERVICE_KEY'] ||
    ''
  ).replace(/^["']|["']$/g, '').trim();

  if (!SUPABASE_URL) {
    throw new Error('Missing required environment variable: SUPABASE_URL');
  }

  if (!serviceRoleKey) {
    throw new Error('Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient<Database>(SUPABASE_URL, serviceRoleKey, {
    global: {
      fetch: createSupabaseFetch(serviceRoleKey),
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with service role - bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) {
      _supabaseAdmin = createSupabaseAdminClient();
    }
    const target = _supabaseAdmin as any;
    const value = target[prop];
    if (typeof value === 'function') {
      return value.bind(target);
    }
    return Reflect.get(target, prop, receiver);
  },
});
