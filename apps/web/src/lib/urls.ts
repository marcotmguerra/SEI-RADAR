export function obterUrlSeiSegura(valor: unknown, origemPermitida: string | undefined): string {
  if (typeof valor !== 'string' || !origemPermitida) return '#';
  try {
    const url = new URL(valor);
    const origem = new URL(origemPermitida).origin;
    return url.protocol === 'https:' && url.origin === origem ? url.href : '#';
  } catch {
    return '#';
  }
}
