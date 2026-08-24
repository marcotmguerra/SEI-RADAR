import { AlertTriangle, CheckCircle2, KeyRound, RefreshCw } from 'lucide-react';
import type { ExecucaoSincronizacao } from '../types';

export function FaixaSincronizacao({ sincronizacao }: { readonly sincronizacao: ExecucaoSincronizacao | undefined }) {
  if (!sincronizacao) return <section className="sync-banner warning"><AlertTriangle /><div><strong>Nenhuma sincronização</strong><span>Execute o agente local para começar.</span></div></section>;
  const sucesso = sincronizacao.status === 'SUCESSO';
  const autenticacaoExpirada = sincronizacao.status === 'SESSAO_EXPIRADA';
  const Icone = sucesso ? CheckCircle2 : autenticacaoExpirada ? KeyRound : AlertTriangle;
  const titulo = sucesso ? 'Sincronização concluída' : autenticacaoExpirada ? 'Sessão do SEI expirada' : 'Sincronização requer atenção';
  const detalhe = sucesso
    ? `${sincronizacao.processosCapturados} de ${sincronizacao.processosEsperados ?? sincronizacao.processosCapturados} processos coletados`
    : sincronizacao.mensagemErro ?? 'Abra o histórico para consultar os detalhes.';
  return (
    <section className={`sync-banner ${sucesso ? 'success' : 'warning'}`}>
      <Icone aria-hidden /><div><strong>{titulo}</strong><span>{detalhe}</span></div>
      <span className="sync-time"><RefreshCw size={14} />{formatarHorario(sincronizacao.finalizadaEm ?? sincronizacao.iniciadaEm)}</span>
    </section>
  );
}

const formatarHorario = (valor: string) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(valor));
