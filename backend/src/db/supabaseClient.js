const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
  );
}

// Service role key is used because this runs on the backend only, never
// sent to the frontend -- it bypasses row-level security, which is fine
// here since all access control happens in our own Express routes.
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = { supabase };