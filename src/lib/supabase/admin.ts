import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getOptionalEnv, getRequiredEnv } from "@/lib/env";

export function createSupabaseAdminClient(): SupabaseClient {
  return createClient(getRequiredEnv("SUPABASE_URL"), getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createOptionalSupabaseAdminClient(): SupabaseClient | null {
  const url = getOptionalEnv("SUPABASE_URL");
  const key = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
