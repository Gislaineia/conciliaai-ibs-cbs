import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!url || !anon) {
    throw new Error(
      "Variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes. Crie um .env.local."
    );
  }
  if (!_client) {
    _client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anon);
}
