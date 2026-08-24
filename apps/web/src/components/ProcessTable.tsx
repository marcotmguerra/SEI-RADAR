import { ExternalLink } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { AtualizacaoProcessoCrm, StatusCrm, Prioridade, RegistroProcesso } from '../types';
import { STATUS_CRM, ROTULOS_PRIORIDADE, ROTULOS_STATUS } from '../types';

interface PropriedadesTabelaProcessos {
  readonly processos: readonly RegistroProcesso[];
  readonly rotuloAcessivel?: string;
  readonly compacta?: boolean;
  readonly aoAlterarStatus?: (id: string, status: StatusCrm) => void;
  readonly aoAlterarCrm?: (id: string, atualizacao: AtualizacaoProcessoCrm) => void;
}

export function TabelaProcessos({
  processos,
  rotuloAcessivel = 'Processos',
  compacta = false,
  aoAlterarStatus,
  aoAlterarCrm,
}: PropriedadesTabelaProcessos) {
  return (
    <div className={`table-wrap process-table-wrap ${compacta ? 'compact-table' : ''}`}>
      <table aria-label={rotuloAcessivel}>
        <thead>
          {compacta ? (
            <tr><th>Processo</th><th>Prioridade</th><th>Mover para</th></tr>
          ) : (
            <tr><th>Processo</th><th>Assunto</th><th>Prioridade</th><th>Marcadores</th><th>Prazo</th><th>Status</th><th>Ações</th></tr>
          )}
        </thead>
        <tbody>
          {processos.map((processo) => compacta
            ? <LinhaProcessoCompacta key={processo.id} processo={processo} {...(aoAlterarStatus ? { aoAlterarStatus } : {})} />
            : <LinhaProcesso key={processo.id} processo={processo} {...(aoAlterarCrm ? { aoAlterarCrm } : {})} />)}
        </tbody>
      </table>
    </div>
  );
}

function LinhaProcesso({ processo, aoAlterarCrm }: {
  readonly processo: RegistroProcesso;
  readonly aoAlterarCrm?: (id: string, atualizacao: AtualizacaoProcessoCrm) => void;
}) {
  return (
    <tr>
      <td><LinkProcesso processo={processo} />{processo.atribuidoAMim ? <span className="assigned-chip">Atribuído a mim</span> : null}</td>
      <td className="subject-cell"><strong>{processo.assunto ?? 'Assunto ainda não coletado'}</strong><span>{processo.unidade}</span></td>
      <td><SeloPrioridade prioridade={processo.prioridade} /></td>
      <td><ListaMarcadores marcadores={processo.marcadores} /></td>
      <td>{processo.dataPrazo ? <time className="deadline" dateTime={processo.dataPrazo}>{formatarData(processo.dataPrazo)}</time> : <span className="muted">Sem prazo</span>}</td>
      <td><span className="status-chip">{ROTULOS_STATUS[processo.statusCrm]}</span></td>
      <td>{aoAlterarCrm ? <EditorCrm processo={processo} aoSalvar={(atualizacao) => aoAlterarCrm(processo.id, atualizacao)} /> : <span className="muted">Somente leitura</span>}</td>
    </tr>
  );
}

function LinhaProcessoCompacta({ processo, aoAlterarStatus }: {
  readonly processo: RegistroProcesso;
  readonly aoAlterarStatus?: (id: string, status: StatusCrm) => void;
}) {
  return (
    <tr>
      <td className="kanban-process-cell"><LinkProcesso processo={processo} /><span>{processo.assunto ?? 'Assunto ainda não coletado'}</span>{processo.dataPrazo ? <time dateTime={processo.dataPrazo}>Prazo {formatarData(processo.dataPrazo)}</time> : null}</td>
      <td><SeloPrioridade prioridade={processo.prioridade} /></td>
      <td>
        <label className="sr-only" htmlFor={`status-${processo.id}`}>Status do processo {processo.numero}</label>
        <select className="status-select" id={`status-${processo.id}`} value={processo.statusCrm} onChange={(evento) => aoAlterarStatus?.(processo.id, evento.target.value as StatusCrm)}>
          {STATUS_CRM.map((status) => <option key={status} value={status}>{ROTULOS_STATUS[status]}</option>)}
        </select>
      </td>
    </tr>
  );
}

function LinkProcesso({ processo }: { readonly processo: RegistroProcesso }) {
  return <a className="process-number" href={processo.urlSei} target="_blank" rel="noreferrer">{processo.numero}<ExternalLink size={13} aria-label="Abrir no SEI" /></a>;
}

function SeloPrioridade({ prioridade }: { readonly prioridade: Prioridade }) {
  return <span className={`priority priority-${prioridade.toLowerCase()}`}>{ROTULOS_PRIORIDADE[prioridade]}</span>;
}

function ListaMarcadores({ marcadores }: { readonly marcadores: readonly string[] }) {
  if (marcadores.length === 0) return <span className="muted">—</span>;
  return <div className="marker-list">{marcadores.map((marcador) => <span key={marcador}>{marcador}</span>)}</div>;
}

function EditorCrm({ processo, aoSalvar }: { readonly processo: RegistroProcesso; readonly aoSalvar: (atualizacao: AtualizacaoProcessoCrm) => void }) {
  const [status, definirStatus] = useState(processo.statusCrm);
  const [prioridade, definirPrioridade] = useState(processo.prioridade);
  const [dataPrazo, definirDataPrazo] = useState(processo.dataPrazo ?? '');
  const [observacoes, definirObservacoes] = useState(processo.observacoes ?? '');
  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    aoSalvar({ statusCrm: status, prioridade, dataPrazo: dataPrazo || null, observacoes: observacoes.trim() || null });
  };
  return <details className="crm-editor"><summary>Editar acompanhamento</summary><form onSubmit={enviar}><label>Status<select value={status} onChange={(evento) => definirStatus(evento.target.value as StatusCrm)}>{STATUS_CRM.map((valor) => <option key={valor} value={valor}>{ROTULOS_STATUS[valor]}</option>)}</select></label><label>Prioridade<select value={prioridade} onChange={(evento) => definirPrioridade(evento.target.value as Prioridade)}>{Object.entries(ROTULOS_PRIORIDADE).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></label><label>Prazo<input type="date" value={dataPrazo} onChange={(evento) => definirDataPrazo(evento.target.value)} /></label><label>Observações<textarea value={observacoes} maxLength={10000} onChange={(evento) => definirObservacoes(evento.target.value)} /></label><button className="primary-button" type="submit">Salvar acompanhamento</button></form></details>;
}

export const formatarData = (valor: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${valor}T12:00:00`));
