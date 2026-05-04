import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export async function signInAsGuest() {
  if (!supabase) return { session: null, error: null }
  const { data, error } = await supabase.auth.signInAnonymously()
  return { session: data.session, error }
}

export async function signOutUser() {
  if (!supabase) return
  await supabase.auth.signOut()
}

export function subscribeToAuthChanges(callback: (session: Session | null) => void) {
  if (!supabase) return { unsubscribe: () => undefined }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return data.subscription
}
