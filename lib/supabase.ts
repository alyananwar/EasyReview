import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Admin client for server-side use only (bypasses row level security).
// All database access goes through API routes — there is no browser client.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
