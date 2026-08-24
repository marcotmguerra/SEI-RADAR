import { AlertTriangle, CheckCircle2, KeyRound } from 'lucide-react';
import type { ExecucaoSincronizacao } from '../types';

export function HistoricoSincronizacoes({ execucoes }: { readonly execucoes: readonly ExecucaoSincronizacao[] }) {
  return <><div className="page-heading"><div><span className="eyebrow">Agente local</span><h1>Sincronizações</h1><p>Confira integridade, duração e falhas das coletas.</p></div></div><div className="table-wrap"><table><thead><tr><th>Início</th><th>Status</th><th>Coleta</th><th>Detalhe</th></tr></thead><tbody>{execucoes.map((execucao) => { const Icone = execucao.status === 'SUCESSO' ? CheckCircle2 : execucao.status === 'SESSAO_EXPIRADA' ? KeyRound : AlertTriangle; return <tr key={execucao.id}><td>{formatar(execucao.iniciadaEm)}</td><td><span className={`table-status status-${execucao.status.toLowerCase()}`}><Icone size={16} />{execucao.status}</span></td><td>{execucao.processosCapturados} / {execucao.processosEsperados ?? '—'}</td><td>{execucao.mensagemErro ?? 'Coleta íntegra'}</td></tr>; })}</tbody></table></div></>;
}

const formatar = (valor: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
