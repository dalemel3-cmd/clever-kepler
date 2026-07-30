import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cwfpjlomlvkburugolky.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3ZnBqbG9tbHZrYnVydWdvbGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzNjMyMTQsImV4cCI6MjEwMDkzOTIxNH0.qcdyTHhg2Cyrtq3mpBP2_91IGQbiiWAOWvb8NFgfLNw'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
