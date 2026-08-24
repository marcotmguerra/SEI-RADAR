import type { RegistroProcesso, EventoSei, ExecucaoSincronizacao } from '../types';

const base = 'https://sei.exemplo.gov.br/controlador.php?acao=procedimento_trabalhar&id_procedimento=';

export const processosDemonstracao: readonly RegistroProcesso[] = [
  {
    id: 'p1', numero: '1400.01.000142/2026-18', assunto: 'Manutenção preventiva de viatura operacional',
    unidade: '5ª Cia BM', urlSei: `${base}1`, naUnidade: true, atribuidoAMim: true, statusCrm: 'NOVO',
    prioridade: 'URGENTE', dataPrazo: '2026-08-25', observacoes: null, marcadores: ['Urgente', 'Frota'],
    vistoPrimeiroEm: '2026-08-24T10:31:00-03:00', vistoUltimoEm: '2026-08-24T11:30:00-03:00',
  },
  {
    id: 'p2', numero: '1400.01.000098/2026-43', assunto: 'Aquisição de equipamentos de proteção individual',
    unidade: '5ª Cia BM', urlSei: `${base}2`, naUnidade: true, atribuidoAMim: true, statusCrm: 'EM_ANALISE',
    prioridade: 'ALTA', dataPrazo: '2026-08-28', observacoes: 'Conferir dotação orçamentária.', marcadores: ['Compras'],
    vistoPrimeiroEm: '2026-08-21T08:20:00-03:00', vistoUltimoEm: '2026-08-24T11:30:00-03:00',
  },
  {
    id: 'p3', numero: '1400.01.000077/2026-29', assunto: 'Resposta a ofício sobre vistoria técnica',
    unidade: '5ª Cia BM', urlSei: `${base}3`, naUnidade: true, atribuidoAMim: false, statusCrm: 'AGUARDANDO_RESPOSTA',
    prioridade: 'NORMAL', dataPrazo: '2026-09-02', observacoes: null, marcadores: ['Vistoria'],
    vistoPrimeiroEm: '2026-08-18T14:10:00-03:00', vistoUltimoEm: '2026-08-24T11:30:00-03:00',
  },
  {
    id: 'p4', numero: '1400.01.000061/2026-73', assunto: 'Escala de treinamento operacional',
    unidade: '5ª Cia BM', urlSei: `${base}4`, naUnidade: true, atribuidoAMim: false, statusCrm: 'PARA_DESPACHO',
    prioridade: 'BAIXA', dataPrazo: null, observacoes: null, marcadores: ['Pessoal'],
    vistoPrimeiroEm: '2026-08-15T09:00:00-03:00', vistoUltimoEm: '2026-08-24T11:30:00-03:00',
  },
  {
    id: 'p5', numero: '1400.01.000031/2026-09', assunto: 'Relatório mensal de atividades',
    unidade: '5ª Cia BM', urlSei: `${base}5`, naUnidade: true, atribuidoAMim: false, statusCrm: 'FINALIZADO',
    prioridade: 'NORMAL', dataPrazo: '2026-08-20', observacoes: 'Concluído e encaminhado.', marcadores: ['Relatórios'],
    vistoPrimeiroEm: '2026-08-05T11:00:00-03:00', vistoUltimoEm: '2026-08-24T11:30:00-03:00',
  },
];

export const execucoesSincronizacaoDemonstracao: readonly ExecucaoSincronizacao[] = [
  { id: 's1', status: 'SUCESSO', iniciadaEm: '2026-08-24T11:30:00-03:00', finalizadaEm: '2026-08-24T11:30:08-03:00', processosEsperados: 180, processosCapturados: 180, mensagemErro: null },
  { id: 's2', status: 'SUCESSO', iniciadaEm: '2026-08-24T11:20:00-03:00', finalizadaEm: '2026-08-24T11:20:08-03:00', processosEsperados: 180, processosCapturados: 180, mensagemErro: null },
  { id: 's3', status: 'INCOMPLETA', iniciadaEm: '2026-08-24T11:10:00-03:00', finalizadaEm: '2026-08-24T11:10:06-03:00', processosEsperados: 180, processosCapturados: 176, mensagemErro: 'Coleta incompleta; nenhuma saída foi confirmada.' },
];

export const eventosDemonstracao: readonly EventoSei[] = [
  { id: 'e1', processoId: 'p1', numeroProcesso: processosDemonstracao[0]?.numero ?? null, tipoEvento: 'ATRIBUIDO_A_MIM', detectadoEm: '2026-08-24T10:32:00-03:00' },
  { id: 'e2', processoId: 'p1', numeroProcesso: processosDemonstracao[0]?.numero ?? null, tipoEvento: 'ENTROU_NA_UNIDADE', detectadoEm: '2026-08-24T10:31:00-03:00' },
  { id: 'e3', processoId: 'p2', numeroProcesso: processosDemonstracao[1]?.numero ?? null, tipoEvento: 'MARCADOR_ADICIONADO', detectadoEm: '2026-08-23T16:12:00-03:00' },
];
