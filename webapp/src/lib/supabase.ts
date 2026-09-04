import { createClient } from '@supabase/supabase-js'

// Same project created earlier in this build - reused here instead of the
// standalone HTML login page, which this React app replaces entirely.
const SUPABASE_URL = 'https://pitasanmfeumfmmloezz.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_t3lbR8vyvGLWVevyF1zfbA_8x4ejGdt'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
