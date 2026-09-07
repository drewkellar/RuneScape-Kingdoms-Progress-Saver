import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true },
        global: {
          fetch: (input, init) =>
            fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(15000) }),
        },
      })
    : null;
export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw Error('Connect Supabase first');
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw Error(error.message);
  return data as T;
}
