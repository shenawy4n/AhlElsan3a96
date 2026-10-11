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

function getRuntimeEnvVar(key: string): string {
  if (typeof globalThis !== 'undefined') {
    const cfEnv = (globalThis as any).__env__;
    if (cfEnv && typeof cfEnv === 'object' && cfEnv[key] !== undefined && cfEnv[key] !== null) {
      return String(cfEnv[key]);
    }
  }
  if (typeof process !== 'undefined' && process?.env && process.env[key] !== undefined && process.env[key] !== null) {
    return String(process.env[key]);
  }
  return '';
}

function createSupabaseAdminClient() {
  const SUPABASE_URL = (
    getRuntimeEnvVar('VITE_SUPABASE_URL') ||
    getRuntimeEnvVar('SUPABASE_URL') ||
    ''
  ).replace(/^["']|["']$/g, '').trim();

  const serviceRoleKey = (
    getRuntimeEnvVar('SUPABASE_SERVICE_ROLE_KEY') ||
    getRuntimeEnvVar('SUPABASE_SERVICE_KEY') ||
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

const _adminClientsCache = new Map<string, ReturnType<typeof createSupabaseAdminClient>>();

function getSupabaseAdminInstance() {
  const SUPABASE_URL = (
    getRuntimeEnvVar('VITE_SUPABASE_URL') ||
    getRuntimeEnvVar('SUPABASE_URL') ||
    ''
  ).replace(/^["']|["']$/g, '').trim();

  const serviceRoleKey = (
    getRuntimeEnvVar('SUPABASE_SERVICE_ROLE_KEY') ||
    getRuntimeEnvVar('SUPABASE_SERVICE_KEY') ||
    ''
  ).replace(/^["']|["']$/g, '').trim();

  const cacheKey = `${SUPABASE_URL}::${serviceRoleKey}`;
  let client = _adminClientsCache.get(cacheKey);
  if (!client) {
    client = createSupabaseAdminClient();
    _adminClientsCache.set(cacheKey, client);
  }
  return client;
}

// Server-side Supabase client with service role - bypasses RLS
// SECURITY: Only use this for trusted server-side operations, never expose to client code
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    const target = getSupabaseAdminInstance() as any;
    const value = target[prop];
    if (typeof value === 'function') {
      return value.bind(target);
    }
    return Reflect.get(target, prop, receiver);
  },
});
