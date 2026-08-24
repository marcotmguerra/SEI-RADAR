import { createClient } from '@supabase/supabase-js';
import { validarChavePublicaSupabase } from './public-key';

const url = import.meta.env.VITE_URL_SUPABASE as string | undefined;
const chave = import.meta.env.VITE_CHAVE_PUBLICA_SUPABASE as string | undefined;

validarChavePublicaSupabase(chave);

export const supabaseConfigurado = Boolean(url && chave);
export const supabase = url && chave
  ? createClient(url, chave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
