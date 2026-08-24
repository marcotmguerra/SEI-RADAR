const decodificarConteudoJwt = (chave: string): Record<string, unknown> | null => {
  const carga = chave.split('.')[1];
  if (!carga) return null;
  try {
    const base64 = carga.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(carga.length / 4) * 4, '=');
    const decodificado = JSON.parse(globalThis.atob(base64));
    return decodificado && typeof decodificado === 'object' ? decodificado as Record<string, unknown> : null;
  } catch {
    return null;
  }
};

export function ehChavePrivadaSupabase(chave: string): boolean {
  if (chave.startsWith('sb_secret_')) return true;
  const papel = decodificarConteudoJwt(chave)?.role;
  return papel === 'service_role' || papel === 'supabase_admin';
}

export function validarChavePublicaSupabase(chave: string | undefined): void {
  if (chave && ehChavePrivadaSupabase(chave)) {
    throw new Error('VITE_CHAVE_PUBLICA_SUPABASE recebeu uma chave privilegiada; use somente anon ou publishable.');
  }
}
