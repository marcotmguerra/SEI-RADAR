import type { RegistroProcesso } from '../types';
import { formatarData } from '../components/ProcessTable';
import { ROTULOS_PRIORIDADE, ROTULOS_STATUS } from '../types';

export function Prazos({ processos }: { readonly processos: readonly RegistroProcesso[] }) {
  const ordenados = [...processos.filter((processo) => processo.naUnidade && processo.dataPrazo)]
    .sort((primeiro, segundo) => String(primeiro.dataPrazo).localeCompare(String(segundo.dataPrazo)));
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Agenda</span><h1>Prazos</h1><p>Priorize entregas e evite vencimentos.</p></div></div>
      <div className="table-wrap"><table aria-label="Prazos dos processos"><thead><tr><th>Vencimento</th><th>Processo</th><th>Assunto</th><th>Prioridade</th><th>Status</th></tr></thead><tbody>{ordenados.map((processo) => <tr key={processo.id}><td><time className="deadline" dateTime={processo.dataPrazo ?? ''}>{processo.dataPrazo ? formatarData(processo.dataPrazo) : ''}</time></td><td><a className="process-number" href={processo.urlSei} target="_blank" rel="noreferrer">{processo.numero}</a></td><td className="subject-cell"><strong>{processo.assunto ?? 'Assunto ainda não coletado'}</strong><span>{processo.unidade}</span></td><td><span className={`priority priority-${processo.prioridade.toLowerCase()}`}>{ROTULOS_PRIORIDADE[processo.prioridade]}</span></td><td><span className="status-chip">{ROTULOS_STATUS[processo.statusCrm]}</span></td></tr>)}</tbody></table></div>
    </>
  );
}
