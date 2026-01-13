import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Hardcoded Supabase credentials (safe for client-side use with RLS)
const SUPABASE_URL = 'https://bcgnmvkgkbhbxzzflwdb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjZ25tdmtna2JoYnh6emZsd2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzQ3OTE4ODEsImV4cCI6MjA1MDM2Nzg4MX0.LqZYO8GGQfI-C9WCF_a2NTKqIrO1TDsPXU9LHRE8b0E';

let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client with hardcoded credentials
 */
export function initializeSupabase(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabaseClient;
}

/**
 * Get existing Supabase client or initialize it
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    return initializeSupabase();
  }
  return supabaseClient;
}

/**
 * Reset Supabase client (useful for tests)
 */
export function resetSupabase(): void {
  supabaseClient = null;
}
