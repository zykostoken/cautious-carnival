/**
 * Centralized Supabase configuration
 * All games and portals should import from here instead of hardcoding credentials.
 *
 * Usage in HTML files:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="/games/shared/supabase-config.js"></script>
 *   // Then use window.sbClient (already initialized) or SUPABASE_CONFIG
 */
(function() {
    'use strict';

    var SUPABASE_CONFIG = {
        url: 'https://buzblnkpfydeheingzgn.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1emJsbmtwZnlkZWhlaW5nemduIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNTY2NDcsImV4cCI6MjA4MzkzMjY0N30.yE7r59S_FDLCoYvWJOXLPzW1E5sqyw63Kl1hZDTtBtA'
    };

    // Export config globally
    window.SUPABASE_CONFIG = SUPABASE_CONFIG;

    // Auto-initialize client if SDK is loaded
    if (window.supabase && window.supabase.createClient) {
        try {
            window.sbClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        } catch (e) {
            console.warn('[supabase-config] Client init failed:', e.message);
            window.sbClient = null;
        }
    } else {
        window.sbClient = null;
        console.warn('[supabase-config] Supabase SDK not loaded yet');
    }
})();
