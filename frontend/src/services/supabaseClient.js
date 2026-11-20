import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let lastAuthEmailRequestFailure = null;

function getErrorDetail(bodyText) {
  if (!bodyText) return '';
  try {
    const body = JSON.parse(bodyText);
    const detail = [body.msg, body.message, body.error_description, body.error, body.details, body.hint, body.code, body.error_code]
      .find(value => typeof value === 'string' && value.trim());
    return detail ? detail.slice(0, 1000) : '';
  } catch {
    return bodyText.trim().slice(0, 1000);
  }
}

// auth-js intentionally treats 5xx responses as retryable before parsing their
// body. Capture only signup/confirmation response details for clear UI errors.
async function supabaseFetch(input, init) {
  const response = await fetch(input, init);
  const requestUrl = typeof input === 'string' ? input : input?.url || '';
  if (/\/auth\/v1\/(otp|signup|resend)(?:\?|$)/.test(requestUrl)) {
    lastAuthEmailRequestFailure = null;
    if (!response.ok) {
      try {
        const detail = getErrorDetail(await response.clone().text());
        lastAuthEmailRequestFailure = { status: response.status, detail };
      } catch {
        lastAuthEmailRequestFailure = { status: response.status, detail: '' };
      }
    }
  }
  return response;
}

export function consumeLastAuthEmailRequestFailure() {
  const failure = lastAuthEmailRequestFailure;
  lastAuthEmailRequestFailure = null;
  return failure;
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase credentials missing! Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: supabaseFetch }
});
