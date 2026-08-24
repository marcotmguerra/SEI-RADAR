import { ArrowDownToLine, ArrowLeftFromLine, Tag, UserCheck } from 'lucide-react';
import type { EventoSei } from '../types';

const rotulos: Record<string, string> = {
  IDENTIFICADO_PRIMEIRA_VEZ: 'Processo identificado pela primeira vez', ENTROU_NA_UNIDADE: 'Entrou na unidade', SAIU_DA_UNIDADE: 'Saiu da unidade',
  ATRIBUIDO_A_MIM: 'Atribuído a você', ATRIBUICAO_REMOVIDA: 'Atribuição removida', MARCADOR_ADICIONADO: 'Marcador adicionado', MARCADOR_REMOVIDO: 'Marcador removido',
};

const IconeEvento = ({ tipo }: { readonly tipo: string }) => {
  const Icone = tipo === 'ENTROU_NA_UNIDADE' ? ArrowDownToLine : tipo === 'SAIU_DA_UNIDADE' ? ArrowLeftFromLine : tipo.includes('ATRIBUI') ? UserCheck : Tag;
  return <Icone size={18} />;
};

export function Historico({ eventos }: { readonly eventos: readonly EventoSei[] }) {
  return <><div className="page-heading"><div><span className="eyebrow">Auditoria</span><h1>Histórico</h1><p>Mudanças observadas pelo agente, em ordem cronológica.</p></div></div><div className="table-wrap"><table aria-label="Histórico de eventos"><thead><tr><th>Data e hora</th><th>Evento</th><th>Processo</th></tr></thead><tbody>{eventos.map((evento) => <tr key={evento.id}><td><time dateTime={evento.detectadoEm}>{formatarDataHora(evento.detectadoEm)}</time></td><td><span className="event-type"><IconeEvento tipo={evento.tipoEvento} />{rotulos[evento.tipoEvento] ?? evento.tipoEvento}</span></td><td>{evento.numeroProcesso ?? '—'}</td></tr>)}</tbody></table></div></>;
}

const formatarDataHora = (valor: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(valor));
