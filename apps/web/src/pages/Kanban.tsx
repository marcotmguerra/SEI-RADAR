import { TabelaProcessos } from '../components/ProcessTable';
import type { StatusCrm, RegistroProcesso } from '../types';
import { STATUS_CRM, ROTULOS_STATUS } from '../types';

export function Kanban({ processos, aoAlterarStatus }: { readonly processos: readonly RegistroProcesso[]; readonly aoAlterarStatus: (id: string, status: StatusCrm) => void }) {
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">Fluxo interno</span><h1>Kanban</h1><p>Organize o trabalho sem alterar o SEI.</p></div></div>
      <div className="kanban" aria-label="Quadro de processos">
        {STATUS_CRM.map((status) => {
          const itens = processos.filter((processo) => processo.statusCrm === status && processo.naUnidade);
          return <section className="kanban-column" key={status}><header><h2>{ROTULOS_STATUS[status]}</h2><span>{itens.length}</span></header>{itens.length > 0 ? <TabelaProcessos processos={itens} rotuloAcessivel={`Lista ${ROTULOS_STATUS[status]}`} compacta aoAlterarStatus={aoAlterarStatus} /> : <p className="kanban-empty">Nenhum processo</p>}</section>;
        })}
      </div>
    </>
  );
}
