import { createClient as createBrowserClient } from '@/utils/supabase/client'

// Legacy export for client components that relied on this singleton
export const supabase = createBrowserClient()
