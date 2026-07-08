import { supabase } from './supabaseClient';

// The entire app state is stored as one JSON document in a single row
// (id = 1) of the `coin_bank` table. This mirrors how the original
// artifact stored data and keeps the port simple. If the app ever
// outgrows this (e.g. you want per-transaction rows you can query in
// SQL), only this file needs to change.
const ROW_ID = 1;

export const storageAdapter = {
  async load() {
    const { data, error } = await supabase
      .from('coin_bank')
      .select('data')
      .eq('id', ROW_ID)
      .maybeSingle();
    if (error) throw error;
    return data ? data.data : null;
  },

  async save(next) {
    const { error } = await supabase.from('coin_bank').upsert({
      id: ROW_ID,
      data: next,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
