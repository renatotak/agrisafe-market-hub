import { SupabaseClient } from '@supabase/supabase-js'

interface SyncLogEntry {
  source: string
  started_at: string
  finished_at: string
  records_fetched: number
  records_inserted: number
  errors: number
  status: 'success' | 'error' | 'partial'
  error_message?: string
}

export async function logSync(supabase: SupabaseClient, entry: SyncLogEntry) {
  try {
    await supabase.from('sync_logs').insert(entry)
  } catch {
    // Silently fail — sync logging should never break the actual sync
    console.error('Failed to log sync:', entry.source)
  }
}
