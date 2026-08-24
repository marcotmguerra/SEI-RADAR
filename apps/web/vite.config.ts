import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validarChavePublicaSupabase } from './src/lib/public-key';

export default defineConfig(({ mode: modo }) => {
  const ambiente = loadEnv(modo, process.cwd(), 'VITE_');
  validarChavePublicaSupabase(ambiente.VITE_CHAVE_PUBLICA_SUPABASE);
  return {
    plugins: [react()],
    server: { port: 5173 },
    preview: { port: 4173 },
  };
});
