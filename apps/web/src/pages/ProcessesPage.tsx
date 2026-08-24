import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty } from './Dashboard';
import { TabelaProcessos } from '../components/ProcessTable';
import type { AtualizacaoProcessoCrm, RegistroProcesso } from '../types';

interface PropriedadesPaginaProcessos {
  readonly titulo: string;
  readonly sobrelinha: string;
  readonly descricao: string;
  readonly processos: readonly RegistroProcesso[];
  readonly aoAlterarCrm?: (id: string, atualizacao: AtualizacaoProcessoCrm) => void;
}

export function PaginaProcessos({ titulo, sobrelinha, descricao, processos, aoAlterarCrm }: PropriedadesPaginaProcessos) {
  const [consulta, definirConsulta] = useState('');
  const [prioridade, definirPrioridade] = useState('TODAS');
  const filtrados = useMemo(() => processos.filter((processo) => {
    const texto = `${processo.numero} ${processo.assunto ?? ''} ${processo.marcadores.join(' ')}`.toLocaleLowerCase('pt-BR');
    return texto.includes(consulta.toLocaleLowerCase('pt-BR')) && (prioridade === 'TODAS' || processo.prioridade === prioridade);
  }), [consulta, prioridade, processos]);
  return (
    <>
      <div className="page-heading"><div><span className="eyebrow">{sobrelinha}</span><h1>{titulo}</h1><p>{descricao}</p></div><span className="count-badge">{filtrados.length} processos</span></div>
      <div className="filters">
        <label className="search-field"><Search size={18} /><span className="sr-only">Buscar processos</span><input value={consulta} onChange={(evento) => definirConsulta(evento.target.value)} placeholder="Número, assunto ou marcador" /></label>
        <label><span className="sr-only">Filtrar por prioridade</span><select value={prioridade} onChange={(evento) => definirPrioridade(evento.target.value)}><option value="TODAS">Todas as prioridades</option><option value="URGENTE">Urgente</option><option value="ALTA">Alta</option><option value="NORMAL">Normal</option><option value="BAIXA">Baixa</option></select></label>
      </div>
      {filtrados.length > 0 ? <TabelaProcessos processos={filtrados} rotuloAcessivel={titulo} {...(aoAlterarCrm ? { aoAlterarCrm } : {})} /> : null}
      {filtrados.length === 0 ? <Empty mensagem="Nenhum processo encontrado com esses filtros." /> : null}
    </>
  );
}
