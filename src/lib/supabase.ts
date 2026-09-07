import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/react';
import { Database } from '../types/database';
import { recordCapturedError } from './errorTracker';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Same "not configured" guard as src/lib/sentry.ts -- avoids capturing (or
// even parsing response bodies for) anything when no real DSN is set.
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

// Postgrest's own internal codes (PGRST116 = no rows, etc.) are expected
// control flow that several services deliberately branch on -- never Sentry
// events. Only a genuine Postgres SQLSTATE (5 alphanumeric chars) is one.
const POSTGRES_SQLSTATE_PATTERN = /^[A-Za-z0-9]{5}$/;

/**
 * Transparent fetch wrapper passed to createClient via global.fetch: always
 * returns the real response untouched, and as a side effect reports
 * PostgREST (/rest/v1/) error-shaped responses (status >= 400) to Sentry.
 * Auth and Storage responses have their own expected error shapes and are
 * left alone entirely.
 */
const fetchWithPostgrestErrorReporting: typeof fetch = async (input, init) => {
  const response = await fetch(input, init);

  if (!SENTRY_DSN || response.status < 400) return response;

  const url = input instanceof Request ? input.url : String(input);
  if (!url.includes('/rest/v1/')) return response;

  try {
    const body = await response.clone().json();
    const code = body?.code;
    if (typeof code !== 'string' || code.startsWith('PGRST') || !POSTGRES_SQLSTATE_PATTERN.test(code)) {
      return response;
    }

    const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
    const message = body.message ?? 'Postgrest error';

    const eventId = Sentry.captureMessage(message, {
      level: 'error',
      tags: { postgres_code: code },
      extra: { details: body.details, hint: body.hint, url, method },
    });

    recordCapturedError({ eventId, code, message, timestamp: Date.now() });
  } catch {
    // Non-JSON or unreadable body -- nothing to report, return untouched.
  }

  return response;
};

console.log('Supabase config:', {
  url: supabaseUrl ? 'Set' : 'Missing',
  key: supabaseAnonKey ? 'Set' : 'Missing'
});

if (!supabaseUrl || !supabaseAnonKey || 
    supabaseUrl.includes('your-project-id') || 
    supabaseAnonKey.includes('your_supabase_anon_key')) {
  throw new Error('Missing or invalid Supabase environment variables. Please update your .env file with actual Supabase credentials.');
}

// Validate URL format
try {
  new URL(supabaseUrl);
} catch (error) {
  throw new Error(`Invalid Supabase URL format: ${supabaseUrl}. Please ensure it starts with https:// and is a valid URL.`);
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithPostgrestErrorReporting },
});