import { CalendarClock, CircleAlert, Files, UserRoundCheck } from 'lucide-react';
import { TabelaProcessos } from '../components/ProcessTable';
import { FaixaSincronizacao } from '../components/SyncBanner';
import type { RegistroProcesso, ExecucaoSincronizacao } from '../types';

export function Painel({ processos, ultimaSincronizacao }: { readonly processos: readonly RegistroProcesso[]; readonly ultimaSincronizacao: ExecucaoSincronizacao | undefined }) {
  const naUnidade = processos.filter((processo) => processo.naUnidade);
  const atribuidos = naUnidade.filter((processo) => processo.atribuidoAMim);
  const urgentes = naUnidade.filter((processo) => processo.prioridade === 'URGENTE' || processo.prioridade === 'ALTA');
  const prazosProximos = naUnidade.filter((processo) => processo.dataPrazo && new Date(processo.dataPrazo).getTime() <= Date.now() + 7 * 86_400_000);
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">{formatarHoje()}</span><h1>Visão geral</h1><p>Acompanhe o que exige sua atenção hoje.</p></div></div>
      <FaixaSincronizacao sincronizacao={ultimaSincronizacao} />
      <div className="table-wrap summary-table-wrap"><table aria-label="Resumo dos processos"><thead><tr><th>Indicador</th><th>Quantidade</th><th>Contexto</th></tr></thead><tbody>
        <LinhaResumo icone={Files} rotulo="Na unidade" valor={naUnidade.length} contexto="Processos ativos observados pelo agente" />
        <LinhaResumo icone={UserRoundCheck} rotulo="Atribuídos a mim" valor={atribuidos.length} contexto="Sua fila pessoal no SEI" />
        <LinhaResumo icone={CircleAlert} rotulo="Alta prioridade" valor={urgentes.length} contexto="Prioridade alta ou urgente no CRM" tom="coral" />
        <LinhaResumo icone={CalendarClock} rotulo="Prazos próximos" valor={prazosProximos.length} contexto="Vencimento previsto nos próximos 7 dias" tom="sand" />
      </tbody></table></div>
      <section className="section-block">
        <div className="section-heading"><div><span className="eyebrow">Fila pessoal</span><h2>Atribuídos a mim</h2></div><a href="/atribuidos">Ver todos</a></div>
        {atribuidos.length > 0 ? <TabelaProcessos processos={atribuidos.slice(0, 5)} rotuloAcessivel="Processos atribuídos a mim" /> : null}
        {atribuidos.length === 0 ? <Empty mensagem="Nenhum processo atribuído a você." /> : null}
      </section>
    </>
  );
}

function LinhaResumo({ icone: Icone, rotulo, valor, contexto, tom = 'teal' }: { readonly icone: typeof Files; readonly rotulo: string; readonly valor: number; readonly contexto: string; readonly tom?: string }) {
  return <tr><td><span className={`summary-label ${tom}`}><Icone size={17} />{rotulo}</span></td><td className="summary-value">{valor}</td><td className="muted">{contexto}</td></tr>;
}

export function Empty({ mensagem }: { readonly mensagem: string }) { return <div className="empty-state"><Files size={28} /><p>{mensagem}</p></div>; }

const formatarHoje = () => {
  const valor = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return valor.charAt(0).toLocaleUpperCase('pt-BR') + valor.slice(1);
};
