import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const SUPABASE_ORIGEN_URL = import.meta.env.VITE_SUPABASE_ORIGEN_URL
const SUPABASE_ORIGEN_ANON_KEY = import.meta.env.VITE_SUPABASE_ORIGEN_ANON_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export const supabaseOrigen = createClient(SUPABASE_ORIGEN_URL, SUPABASE_ORIGEN_ANON_KEY)
