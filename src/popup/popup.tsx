import React, { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ExternalLink,
  RefreshCw,
  Settings,
  Search,
  CheckCircle,
  Bell,
  FileText,
  Clock,
  CheckCheck,
  User,
  Tag,
  X,
  Sun,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertTriangle,
  BellOff,
  PanelRight,
} from 'lucide-react';
import {
  obterConfiguracao,
  obterProcessos,
  obterStatusSessao,
  marcarProcessoComoLido,
  marcarTodosProcessosComoLidos,
  salvarConfiguracao,
} from '../shared/storage';
import { suportaPainelLateral } from '../shared/painel-lateral';
import type { ConfiguracaoExtensao, ProcessoSei, StatusSessao, RegraNotificacao } from '../types';

const formatarHora = (dataIso: string): string => {
  try {
    const data = new Date(dataIso);
    const agora = new Date();
    const diferencaMinutos = Math.floor((agora.getTime() - data.getTime()) / (1000 * 60));

    if (diferencaMinutos < 1) return 'Agora mesmo';
    if (diferencaMinutos < 60) return `Há ${diferencaMinutos} min`;

    return data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Recente';
  }
};

// Normaliza para dígitos quando o valor parece um CPF (11+ dígitos), senão compara como texto simples
const normalizarParaComparacao = (valor: string): string => {
  const digitos = valor.replace(/\D/g, '');
  return digitos.length >= 11 ? digitos : valor.trim().toLowerCase();
};

const ehMeuProcesso = (proc: ProcessoSei, sigla?: string): boolean => {
  if (!sigla || !sigla.trim() || !proc.atribuidoPara) return false;
  const s = normalizarParaComparacao(sigla);
  const a = normalizarParaComparacao(proc.atribuidoPara);
  return a.includes(s) || s.includes(a);
};

type PeriodoFiltro = 'todos' | 'hoje' | 'ontem';

const ehMesmoDiaCalendario = (dataIso: string, referencia: Date): boolean => {
  try {
    const data = new Date(dataIso);
    return (
      data.getFullYear() === referencia.getFullYear() &&
      data.getMonth() === referencia.getMonth() &&
      data.getDate() === referencia.getDate()
    );
  } catch {
    return false;
  }
};

const ehHoje = (dataIso: string): boolean => ehMesmoDiaCalendario(dataIso, new Date());

const ehOntem = (dataIso: string): boolean => {
  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  return ehMesmoDiaCalendario(dataIso, ontem);
};

interface PopupAppProps {
  modoLateral?: boolean;
}

export const PopupApp: React.FC<PopupAppProps> = ({ modoLateral = false }) => {
  const [processos, setProcessos] = useState<ProcessoSei[]>([]);
  const [config, setConfig] = useState<ConfiguracaoExtensao | null>(null);
  const [status, setStatus] = useState<StatusSessao>('verificando');
  const [ultimaVerificacao, setUltimaVerificacao] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'meus' | 'nao_lidos'>('todos');
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('todos');
  const [marcadorFiltro, setMarcadorFiltro] = useState<string | null>(null);
  const [marcadorExpandido, setMarcadorExpandido] = useState<{ numero: string; nome: string } | null>(null);
  const [novoMarcadorInput, setNovoMarcadorInput] = useState('');
  const [exibindoConfig, setExibindoConfig] = useState(false);
  const [mensagemAviso, setMensagemAviso] = useState<string | null>(null);
  const [idJanelaAtual, setIdJanelaAtual] = useState<number | null>(null);

  // Carrega dados iniciais e dispara checagem rápida
  const carregarDados = async () => {
    try {
      const [procs, conf, sessao] = await Promise.all([
        obterProcessos(),
        obterConfiguracao(),
        obterStatusSessao(),
      ]);
      setProcessos(procs);
      setConfig(conf);
      setStatus(sessao.status);
      setUltimaVerificacao(sessao.ultimaVerificacao);
    } catch (erro) {
      console.error('Erro ao carregar dados do popup:', erro);
    }
  };

  useEffect(() => {
    carregarDados();
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime
        .sendMessage({ tipo: 'VERIFICAR_AGORA' })
        .then(() => carregarDados())
        .catch(() => {});
    }
  }, []);

  // Pré-carrega o windowId no mount para que o clique em "Abrir na lateral" possa
  // chamar chrome.sidePanel.open() de forma síncrona (a API exige gesto do usuário,
  // que não sobrevive de forma confiável a um await intermediário)
  useEffect(() => {
    if (modoLateral || !suportaPainelLateral()) return;

    chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((abas) => {
        const id = abas[0]?.windowId;
        if (typeof id === 'number') setIdJanelaAtual(id);
      })
      .catch(() => {
        // Sem windowId, o botão de painel lateral fica desabilitado
      });
  }, [modoLateral]);

  // Dispara verificação manual imediata (duração mínima para o spinner ficar perceptível)
  const handleVerificarAgora = async () => {
    setCarregando(true);
    const inicio = Date.now();
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        await chrome.runtime.sendMessage({ tipo: 'VERIFICAR_AGORA' });
      }
      await carregarDados();
    } catch (erro) {
      console.error('Erro na verificação manual:', erro);
    } finally {
      const restante = 600 - (Date.now() - inicio);
      if (restante > 0) {
        await new Promise((resolve) => setTimeout(resolve, restante));
      }
      setCarregando(false);
    }
  };

  // Abre ou foca a aba do SEI
  const handleAbrirSei = async (urlDestino?: string) => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({ tipo: 'ABRIR_SEI', url: urlDestino });
    } else if (config) {
      window.open(urlDestino || config.urlControle, '_blank');
    }
  };

  // Marca um processo individual como lido
  const handleMarcarLido = async (numero: string, evento: React.MouseEvent) => {
    evento.stopPropagation();
    const atualizados = await marcarProcessoComoLido(numero);
    setProcessos(atualizados);
  };

  // Marca todos os processos como lidos
  const handleMarcarTodosLidos = async () => {
    const atualizados = await marcarTodosProcessosComoLidos();
    setProcessos(atualizados);
  };

  // Salva alterações de configuração
  const handleSalvarConfig = async () => {
    if (!config) return;
    await salvarConfiguracao(config);
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        tipo: 'SALVAR_CONFIGURACAO',
        configuracao: config,
      });
    }
    setMensagemAviso('Configurações salvas!');
    setTimeout(() => {
      setMensagemAviso(null);
      setExibindoConfig(false);
    }, 1200);
  };

  // Dispara notificação de teste
  const handleTestarNotificacao = async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({ tipo: 'TESTAR_NOTIFICACAO' });
    }
  };

  // Abre o painel lateral. NÃO transformar em async: chrome.sidePanel.open() exige
  // gesto do usuário e nenhum await pode precedê-lo, ou a chamada falha silenciosamente.
  const handleAbrirNaLateral = () => {
    if (!suportaPainelLateral() || idJanelaAtual === null) return;

    chrome.sidePanel
      .open({ windowId: idJanelaAtual })
      .then(() => {
        window.close();
      })
      .catch((erro: unknown) => {
        console.error('Falha ao abrir o painel lateral:', erro);
        setMensagemAviso('Não foi possível abrir o painel lateral.');
      });
  };

  // Alterna o alerta sonoro direto pelo cabeçalho (atualização otimista, sem precisar abrir Configurações)
  const handleAlternarSom = async () => {
    if (!config) return;
    const somAtivo = !config.somAtivo;
    setConfig({ ...config, somAtivo });
    await salvarConfiguracao({ somAtivo });
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        tipo: 'SALVAR_CONFIGURACAO',
        configuracao: { somAtivo },
      });
    }
  };

  // Todos os marcadores únicos detectados na base
  const todosMarcadores = useMemo(() => {
    const set = new Set<string>();
    for (const proc of processos) {
      if (proc.marcadores) {
        for (const m of proc.marcadores) {
          if (m.nome && m.nome.trim()) set.add(m.nome.trim());
        }
      }
    }
    if (config?.marcadoresNotificacao) {
      for (const m of config.marcadoresNotificacao) {
        if (m && m.trim()) set.add(m.trim());
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [processos, config?.marcadoresNotificacao]);

  // Contagem de processos atribuídos a mim
  const totalMeus = useMemo(() => {
    return processos.filter((p) => ehMeuProcesso(p, config?.usuarioSigla)).length;
  }, [processos, config?.usuarioSigla]);

  const totalNaoLidos = useMemo(() => {
    return processos.filter((p) => !p.lido).length;
  }, [processos]);

  // Resumo do expediente: novidades de hoje e quantas são atribuídas a mim
  const resumoHoje = useMemo(() => {
    const doDia = processos.filter((p) => ehHoje(p.detectadoEm));
    return {
      novos: doDia.length,
      meus: doDia.filter((p) => ehMeuProcesso(p, config?.usuarioSigla)).length,
    };
  }, [processos, config?.usuarioSigla]);

  // Filtra e ordena processos
  const processosFiltrados = useMemo(() => {
    return processos
      .filter((p) => {
        // Filtro de aba/categoria
        if (filtroTipo === 'nao_lidos' && p.lido) return false;
        if (filtroTipo === 'meus' && !ehMeuProcesso(p, config?.usuarioSigla)) return false;

        // Filtro de período
        if (periodoFiltro === 'hoje' && !ehHoje(p.detectadoEm)) return false;
        if (periodoFiltro === 'ontem' && !ehOntem(p.detectadoEm)) return false;

        // Filtro de Marcador
        if (marcadorFiltro) {
          if (!p.marcadores || !p.marcadores.some((m) => m.nome === marcadorFiltro)) return false;
        }

        // Filtro de busca textual
        if (!termoBusca.trim()) return true;
        const termo = termoBusca.toLowerCase();
        const num = p.numero.toLowerCase();
        const assunto = (p.assunto || '').toLowerCase();
        const atribuicao = (p.atribuidoPara || '').toLowerCase();
        const marcadoresTexto = (p.marcadores || [])
          .map((m) => `${m.nome} ${m.texto || ''}`)
          .join(' ')
          .toLowerCase();

        return (
          num.includes(termo) ||
          assunto.includes(termo) ||
          atribuicao.includes(termo) ||
          marcadoresTexto.includes(termo)
        );
      })
      .sort((a, b) => new Date(b.detectadoEm).getTime() - new Date(a.detectadoEm).getTime());
  }, [processos, filtroTipo, periodoFiltro, marcadorFiltro, termoBusca, config?.usuarioSigla]);

  const alternarMarcadorNotificacao = (marcador: string) => {
    if (!config) return;
    const lista = config.marcadoresNotificacao || [];
    const existe = lista.includes(marcador);
    const atualizada = existe ? lista.filter((m) => m !== marcador) : [...lista, marcador];
    setConfig({ ...config, marcadoresNotificacao: atualizada });
  };

  const adicionarMarcadorPersonalizado = () => {
    if (!config || !novoMarcadorInput.trim()) return;
    const marcador = novoMarcadorInput.trim();
    const lista = config.marcadoresNotificacao || [];
    if (!lista.includes(marcador)) {
      setConfig({ ...config, marcadoresNotificacao: [...lista, marcador] });
    }
    setNovoMarcadorInput('');
  };

  return (
    <div className="popup-container">
      {/* Cabeçalho */}
      <header className="header">
        <div className="header-title-row">
          <span className="logo-badge">SEI!</span>
          <h1 className="title">Alerta</h1>
        </div>

        <div className="header-actions">
          <button
            className="btn-open-sei"
            onClick={() => handleAbrirSei()}
            title="Abrir página de controle do SEI"
          >
            <ExternalLink size={13} />
            Abrir SEI
          </button>
          <button
            className="btn-icon"
            onClick={handleVerificarAgora}
            disabled={carregando}
            title="Verificar agora"
            aria-label="Verificar processos agora"
          >
            <RefreshCw size={15} className={carregando ? 'spin' : ''} />
          </button>
          {config && (
            <button
              className={`btn-icon ${config.somAtivo ? 'active' : ''}`}
              onClick={handleAlternarSom}
              title={config.somAtivo ? 'Desativar alerta sonoro' : 'Ativar alerta sonoro'}
              aria-label={config.somAtivo ? 'Desativar alerta sonoro' : 'Ativar alerta sonoro'}
              aria-pressed={config.somAtivo}
            >
              {config.somAtivo ? <Bell size={15} /> : <BellOff size={15} />}
            </button>
          )}
          {!modoLateral && suportaPainelLateral() && (
            <button
              className="btn-icon"
              onClick={handleAbrirNaLateral}
              disabled={idJanelaAtual === null}
              title="Abrir na lateral"
              aria-label="Abrir extensão no painel lateral do navegador"
            >
              <PanelRight size={15} />
            </button>
          )}
          <button
            className={`btn-icon ${exibindoConfig ? 'active' : ''}`}
            onClick={() => setExibindoConfig(!exibindoConfig)}
            title="Configurações"
            aria-label="Abrir configurações"
          >
            <Settings size={15} />
          </button>
        </div>
      </header>

      {/* Barra de Status */}
      <div className="status-bar">
        <div className="status-badge">
          <span className={`status-text status-text--${status}`}>
            {status === 'conectado' && 'Conectado ao SEI'}
            {status === 'verificando' && 'Verificando processos...'}
            {status === 'desconectado' && 'Faça login no SEI'}
            {status === 'erro' && 'Erro de conexão'}
          </span>
        </div>
        <div className="status-info">
          {ultimaVerificacao ? `Atualizado: ${formatarHora(ultimaVerificacao)}` : 'Nunca verificado'}
        </div>
      </div>

      {!exibindoConfig && (
        <div className="summary-bar">
          <Sun size={12} />
          <span>
            Hoje: <strong>{resumoHoje.novos}</strong> novo{resumoHoje.novos === 1 ? '' : 's'} processo
            {resumoHoje.novos === 1 ? '' : 's'} | <strong>{resumoHoje.meus}</strong> atribuído
            {resumoHoje.meus === 1 ? '' : 's'} a você
          </span>
        </div>
      )}

      {status === 'desconectado' && !exibindoConfig && (
        <div className="connection-banner warning">
          <span className="banner-message">
            <AlertTriangle size={15} aria-hidden="true" />
            Sessão finalizada. Faça login para continuar recebendo notificações.
          </span>
          <button className="btn-banner-action" onClick={() => handleAbrirSei()}>
            Fazer Login
          </button>
        </div>
      )}

      {status === 'erro' && !exibindoConfig && (
        <div className="connection-banner error">
          <span className="banner-message">
            <AlertTriangle size={15} aria-hidden="true" />
            SEI instável ou fora do ar. Tentando reconectar...
          </span>
          <button className="btn-banner-action" onClick={handleVerificarAgora}>
            Reconectar
          </button>
        </div>
      )}

      {exibindoConfig && config ? (
        /* Tela de Configurações */
        <div className="settings-view">
          <div className="setting-group">
            <label className="setting-label">Usuário no SEI</label>
            <input
              type="text"
              inputMode="numeric"
              className="setting-input"
              value={config.usuarioSigla}
              onChange={(e) =>
                setConfig({ ...config, usuarioSigla: e.target.value.replace(/\D/g, '').slice(0, 11) })
              }
              placeholder="Ex: 00652162614"
            />
            <span className="setting-hint">
              Seu CPF, apenas números — usado para filtrar os processos atribuídos a você. Se deixar em
              branco, tentará capturar automaticamente do SEI.
            </span>
          </div>

          <div className="setting-group">
            <label className="setting-label">Regra de Notificações</label>
            <select
              className="setting-select"
              value={config.regraNotificacao}
              onChange={(e) =>
                setConfig({ ...config, regraNotificacao: e.target.value as RegraNotificacao })
              }
            >
              <option value="todos">Todos os novos processos recebidos</option>
              <option value="atribuidos">Apenas novos processos atribuídos a mim</option>
              <option value="atribuidos_e_marcadores">
                Atribuídos a mim OU com marcadores selecionados
              </option>
            </select>
          </div>

          {config.regraNotificacao === 'atribuidos_e_marcadores' && (
            <div className="setting-group">
              <label className="setting-label">Marcadores para Notificar</label>
              <div className="markers-selection-wrap">
                {todosMarcadores.map((m) => {
                  const selecionado = (config.marcadoresNotificacao || []).includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      className={`marker-select-chip ${selecionado ? 'selected' : ''}`}
                      onClick={() => alternarMarcadorNotificacao(m)}
                    >
                      <Tag size={10} />
                      {m}
                    </button>
                  );
                })}
              </div>
              <div className="add-marker-row">
                <input
                  type="text"
                  className="setting-input"
                  value={novoMarcadorInput}
                  onChange={(e) => setNovoMarcadorInput(e.target.value)}
                  placeholder="Digitar outro marcador..."
                  onKeyDown={(e) => e.key === 'Enter' && adicionarMarcadorPersonalizado()}
                />
                <button
                  type="button"
                  className="btn-secondary btn-compact"
                  onClick={adicionarMarcadorPersonalizado}
                >
                  Adicionar
                </button>
              </div>
            </div>
          )}

          <div className="setting-group">
            <label className="setting-label">URL de Controle do SEI</label>
            <input
              type="text"
              className="setting-input"
              value={config.urlControle}
              onChange={(e) => setConfig({ ...config, urlControle: e.target.value })}
              placeholder="https://www.sei.mg.gov.br/sei/controlador.php?acao=procedimento_controlar"
            />
          </div>

          <div className="setting-group">
            <label className="setting-label">Intervalo de Verificação Automática</label>
            <select
              className="setting-select"
              value={config.intervaloMinutos}
              onChange={(e) => setConfig({ ...config, intervaloMinutos: Number(e.target.value) })}
            >
              <option value={1}>A cada 1 minuto</option>
              <option value={2}>A cada 2 minutos</option>
              <option value={5}>A cada 5 minutos (Recomendado)</option>
              <option value={10}>A cada 10 minutos</option>
              <option value={15}>A cada 15 minutos</option>
            </select>
          </div>

          <div className="setting-toggle-row">
            <div>
              <div className="setting-label">Notificações no Sistema</div>
              <div className="setting-toggle-desc">Avisar no canto da tela quando novos processos entrarem</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={config.notificacoesAtivas}
                onChange={(e) => setConfig({ ...config, notificacoesAtivas: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>

          <div className="setting-toggle-row">
            <div>
              <div className="setting-label">Alerta Sonoro</div>
              <div className="setting-toggle-desc">Emitir som discreto ao receber novo processo</div>
            </div>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={config.somAtivo}
                onChange={(e) => setConfig({ ...config, somAtivo: e.target.checked })}
              />
              <span className="slider" />
            </label>
          </div>

          <button className="btn-secondary" onClick={handleTestarNotificacao}>
            <Bell size={14} />
            Testar Notificação de Exemplo
          </button>

          <button className="btn-primary-full" onClick={handleSalvarConfig}>
            {mensagemAviso || 'Salvar Configurações'}
          </button>
        </div>
      ) : (
        /* Tela Principal de Processos */
        <>
          <div className="search-section">
            <div className="search-input-wrap">
              <Search size={14} />
              <input
                type="text"
                className="search-input"
                placeholder="Buscar por número, assunto, marcador..."
                value={termoBusca}
                onChange={(e) => setTermoBusca(e.target.value)}
              />
            </div>

            <div className="filters-row">
              <div className="filter-pills">
                <button
                  className={`filter-pill ${filtroTipo === 'todos' ? 'active' : ''}`}
                  onClick={() => setFiltroTipo('todos')}
                >
                  Todos ({processos.length})
                </button>
                <button
                  className={`filter-pill ${filtroTipo === 'meus' ? 'active' : ''}`}
                  onClick={() => setFiltroTipo('meus')}
                >
                  Atribuídos a Mim ({totalMeus})
                </button>
                <button
                  className={`filter-pill ${filtroTipo === 'nao_lidos' ? 'active' : ''}`}
                  onClick={() => setFiltroTipo('nao_lidos')}
                >
                  Novos ({totalNaoLidos})
                </button>
              </div>

              {totalNaoLidos > 0 && (
                <button className="btn-mark-all" onClick={handleMarcarTodosLidos}>
                  <CheckCheck size={12} style={{ display: 'inline', marginRight: 3 }} />
                  Marcar todos lidos
                </button>
              )}
            </div>

            <div className="period-pills">
              {(['todos', 'hoje', 'ontem'] as PeriodoFiltro[]).map((periodo) => (
                <button
                  key={periodo}
                  className={`period-pill ${periodoFiltro === periodo ? 'active' : ''}`}
                  onClick={() => setPeriodoFiltro(periodo)}
                >
                  {periodo === 'todos' ? 'Todos' : periodo === 'hoje' ? 'Hoje' : 'Ontem'}
                </button>
              ))}
            </div>

            {/* Chips de Marcadores */}
            {todosMarcadores.length > 0 && (
              <div className="marker-chips-row">
                <button
                  className={`marker-chip ${marcadorFiltro === null ? 'active' : ''}`}
                  onClick={() => setMarcadorFiltro(null)}
                >
                  Todos Marcadores
                </button>
                {todosMarcadores.map((marcador) => {
                  const ativo = marcadorFiltro === marcador;
                  return (
                    <button
                      key={marcador}
                      className={`marker-chip ${ativo ? 'active' : ''}`}
                      onClick={() => setMarcadorFiltro(ativo ? null : marcador)}
                    >
                      <Tag size={10} style={{ marginRight: 3 }} />
                      {marcador}
                      {ativo && <X size={10} style={{ marginLeft: 3 }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <main className="process-list">
            {processosFiltrados.length === 0 ? (
              <div className="empty-state">
                {processos.length === 0 ? (
                  <>
                    <FileText size={36} color="var(--cor-texto-fraco)" />
                    <p>Nenhum processo carregado ainda</p>
                    <span>
                      Sincronize para trazer os processos que já estão no SEI. Isso não dispara
                      notificações — é só a carga inicial.
                    </span>
                    <button
                      type="button"
                      className="btn-sync-inicial"
                      onClick={handleVerificarAgora}
                      disabled={carregando}
                    >
                      <RefreshCw size={14} className={carregando ? 'spin' : ''} />
                      {carregando ? 'Sincronizando...' : 'Sincronizar'}
                    </button>
                  </>
                ) : (
                  <>
                    <FileText size={36} color="var(--cor-texto-fraco)" />
                    <p>Nenhum processo encontrado</p>
                    <span>
                      {filtroTipo === 'meus' && !config?.usuarioSigla
                        ? 'Configure seu CPF nas opções para ver os processos atribuídos a você.'
                        : 'Tente alterar os filtros ou termos da busca.'}
                    </span>
                  </>
                )}
              </div>
            ) : (
              processosFiltrados.map((proc) => {
                const ehMeu = ehMeuProcesso(proc, config?.usuarioSigla);

                return (
                  <article
                    key={proc.numero}
                    className={`process-card ${!proc.lido ? 'unread' : ''}`}
                    onClick={() => handleAbrirSei(proc.link)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="process-header">
                      <a
                        href={proc.link}
                        className="process-number"
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleAbrirSei(proc.link);
                        }}
                      >
                        {proc.numero}
                        <ExternalLink size={11} />
                      </a>

                      <div className="process-badges">
                        {proc.atribuidoPara && (
                          <span className={`badge-attribution ${ehMeu ? 'mine' : ''}`}>
                            <User size={10} style={{ marginRight: 2 }} />
                            {proc.atribuidoPara}
                          </span>
                        )}
                        {!proc.lido && proc.motivoAtualizacao && (
                          <span className="badge-updated">
                            <Sparkles size={9} style={{ marginRight: 2 }} />
                            Atualizado
                          </span>
                        )}
                        {!proc.lido && !proc.motivoAtualizacao && <span className="badge-new">Novo</span>}
                      </div>
                    </div>

                    <div className="process-subject">
                      {proc.assunto || 'Sem assunto especificado'}
                    </div>

                    {proc.marcadores && proc.marcadores.length > 0 && (
                      <div className="card-markers-row">
                        {proc.marcadores.map((m) => {
                          const expandido =
                            marcadorExpandido?.numero === proc.numero && marcadorExpandido?.nome === m.nome;
                          return (
                            <button
                              key={m.nome}
                              type="button"
                              className={`card-marker-badge ${m.texto ? 'has-text' : ''} ${expandido ? 'expanded' : ''}`}
                              title={m.texto || m.nome}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!m.texto) return;
                                setMarcadorExpandido(expandido ? null : { numero: proc.numero, nome: m.nome });
                              }}
                            >
                              <Tag size={9} style={{ marginRight: 3 }} />
                              {m.nome}
                              {m.texto && (expandido ? <ChevronUp size={9} style={{ marginLeft: 2 }} /> : <ChevronDown size={9} style={{ marginLeft: 2 }} />)}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {marcadorExpandido?.numero === proc.numero && (
                      <div className="marker-detail-box" onClick={(e) => e.stopPropagation()}>
                        {proc.marcadores?.find((m) => m.nome === marcadorExpandido.nome)?.texto}
                      </div>
                    )}

                    <div className="process-footer">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Clock size={11} />
                        {formatarHora(proc.detectadoEm)}
                      </span>

                      {!proc.lido && (
                        <button
                          className="btn-read-toggle"
                          onClick={(e) => handleMarcarLido(proc.numero, e)}
                          title="Marcar como lido"
                        >
                          <CheckCircle size={12} />
                          Marcar lido
                        </button>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </main>
        </>
      )}
    </div>
  );
};

const elementoRoot = document.getElementById('root');
if (elementoRoot) {
  const root = createRoot(elementoRoot);
  root.render(<PopupApp modoLateral={document.body.classList.contains('modo-lateral')} />);
}
