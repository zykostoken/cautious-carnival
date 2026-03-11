// Centralized Supabase configuration
// All frontend files should import from here instead of hardcoding credentials
// The anon key is a PUBLIC key designed for client-side use - security comes from RLS policies

const SUPABASE_URL = 'https://buzblnkpfydeheingzgn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emJsbmtwZnlkZWhlaW5nemduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTY2NDcsImV4cCI6MjA4MzkzMjY0N30.yE7r59S_FDLCoYvWJOXLPzW1E5sqyw63Kl1hZDTtBtA';

function getSupabaseClient() {
  if (window._supabaseClient) return window._supabaseClient;
  if (!window.supabase || !window.supabase.createClient) {
    console.error('[supabase-config] Supabase JS SDK not loaded. Add <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> before this script.');
    return null;
  }
  window._supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return window._supabaseClient;
}
