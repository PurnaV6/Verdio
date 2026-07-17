/* ================================================================
   VERDIO — Supabase Client (Step 5 - SaaS Auth for Endorsement)
   Provides real multi-tenant auth without breaking local dev.
   If no env vars are set, it falls back to mock mode so localhost
   still works for your endorsement demo.

   Drop in: src/lib/auth/supabaseClient.ts
   npm i @supabase/supabase-js
   Add to .env:
   VITE_SUPABASE_URL=https://xxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ================================================================ */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!url || !anon) return null;
  if (!client) {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }
  return client;
}

export const isSupabaseEnabled = !!url && !!anon;

// Helper for history: tries Supabase first, falls back to localStorage
export async function getUserId(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user?.id ?? null;
}
