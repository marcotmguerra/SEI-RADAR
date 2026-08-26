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
  Target,
  Check,
  ShieldCheck,
  SlidersHorizontal,
  ArrowRight,
  ArrowLeft,
  Inbox,
  Trash2,
} from 'lucide-react';
import {
  obterConfiguracao,
  obterProcessos,
  obterStatusSessao,
  obterMarcadoresDisponiveis,
  marcarProcessoComoLido,
  marcarTodosProcessosComoLidos,
  salvarConfiguracao,
  limparProcessos,
} from '../shared/storage';
import {
  ehProcessoAtribuido,
  descreverEscopoRadar,
  normalizarParaComparacao,
} from '../shared/radar';
import { suportaPainelLateral } from '../shared/painel-lateral';
import { solicitarPermissaoParaUrl } from '../shared/permissoes';
import type {
  ConfiguracaoExtensao,
  ProcessoSei,
  StatusSessao,
  RegraNotificacao,
  EscopoRadar,
} from '../types';

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

const ehMeuProcesso = (proc: ProcessoSei, sigla?: string): boolean => {
  return ehProcessoAtribuido(proc, sigla);
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
  const [marcadoresDisponiveis, setMarcadoresDisponiveis] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusSessao>('verificando');
  const [ultimaVerificacao, setUltimaVerificacao] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [termoBusca, setTermoBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'meus' | 'nao_lidos'>('todos');
  const [periodoFiltro, setPeriodoFiltro] = useState<PeriodoFiltro>('todos');
  const [marcadorFiltro, setMarcadorFiltro] = useState<string | null>(null);
  const [marcadorExpandido, setMarcadorExpandido] = useState<{ numero: string; nome: string } | null>(null);
  const [exibindoConfig, setExibindoConfig] = useState(false);
  const [mensagemAviso, setMensagemAviso] = useState<string | null>(null);
  const [idJanelaAtual, setIdJanelaAtual] = useState<number | null>(null);
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const timeoutConfirmacaoRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Estados temporários para Onboarding
  const [onboardingEscopo, setOnboardingEscopo] = useState<EscopoRadar>('atribuidos');
  const [onboardingCpf, setOnboardingCpf] = useState('');
  const [onboardingMarcadores, setOnboardingMarcadores] = useState<string[]>([]);

  // Carrega dados iniciais e dispara checagem rápida
  const carregarDados = async () => {
    try {
      const [procs, conf, sessao, marcadores] = await Promise.all([
        obterProcessos(),
        obterConfiguracao(),
        obterStatusSessao(),
        obterMarcadoresDisponiveis(),
      ]);
      setProcessos(procs);
      setConfig(conf);
      setStatus(sessao.status);
      setUltimaVerificacao(sessao.ultimaVerificacao);
      setMarcadoresDisponiveis(marcadores);

      if (conf) {
        setOnboardingEscopo(conf.escopoRadar || 'atribuidos');
        setOnboardingCpf(conf.usuarioSigla || '');
        setOnboardingMarcadores(conf.marcadoresRadar || []);
      }
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

  // Pré-carrega o windowId no mount para abrir na lateral
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

  // Limpa o timeout de confirmação pendente ao desmontar
  useEffect(() => {
    return () => {
      if (timeoutConfirmacaoRef.current) clearTimeout(timeoutConfirmacaoRef.current);
    };
  }, []);

  // Dispara verificação manual imediata
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

  // Remove do armazenamento todos os processos sincronizados (exige confirmação em dois cliques)
  const handleLimparProcessos = async () => {
    if (!confirmandoLimpeza) {
      setConfirmandoLimpeza(true);
      timeoutConfirmacaoRef.current = setTimeout(() => setConfirmandoLimpeza(false), 4000);
      return;
    }

    if (timeoutConfirmacaoRef.current) {
      clearTimeout(timeoutConfirmacaoRef.current);
      timeoutConfirmacaoRef.current = null;
    }
    setConfirmandoLimpeza(false);

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({ tipo: 'LIMPAR_PROCESSOS' });
    } else {
      await limparProcessos();
    }

    setProcessos([]);
    await carregarDados();
    setMensagemAviso('Processos removidos.');
    setTimeout(() => setMensagemAviso(null), 1500);
  };

  // Salva alterações de configuração
  const handleSalvarConfig = async (novaConfiguracao?: Partial<ConfiguracaoExtensao>) => {
    if (!config) return;
    const configAtualizada = { ...config, ...(novaConfiguracao || {}) };

    // Solicita, neste gesto do usuário, acesso apenas ao domínio do SEI configurado —
    // necessário para a verificação em segundo plano funcionar sem uma aba do SEI aberta
    let avisoPermissao: string | null = null;
    if (configAtualizada.urlControle) {
      const concedida = await solicitarPermissaoParaUrl(configAtualizada.urlControle);
      if (!concedida) {
        avisoPermissao =
          'Permissão não concedida: a sincronização automática só funcionará com uma aba do SEI aberta.';
      }
    }

    setConfig(configAtualizada);
    await salvarConfiguracao(configAtualizada);

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({
        tipo: 'SALVAR_CONFIGURACAO',
        configuracao: configAtualizada,
      });
    }

    setMensagemAviso(avisoPermissao || 'Configurações salvas!');
    await carregarDados();
    setTimeout(() => {
      setMensagemAviso(null);
      setExibindoConfig(false);
    }, avisoPermissao ? 3000 : 1000);
  };

  // Handlers do Onboarding
  const handleConcluirOnboarding = async () => {
    if (!config) return;
    const atualizacoes: Partial<ConfiguracaoExtensao> = {
      escopoRadar: onboardingEscopo,
      usuarioSigla: onboardingCpf || config.usuarioSigla,
      marcadoresRadar: onboardingMarcadores,
      radarOnboardingConcluido: true,
      primeiraCargaRealizada: false,
    };
    await handleSalvarConfig(atualizacoes);
    await handleVerificarAgora();
  };

  const handleConfigurarDepois = async () => {
    if (!config) return;
    const atualizacoes: Partial<ConfiguracaoExtensao> = {
      escopoRadar: 'unidade',
      radarOnboardingConcluido: true,
      primeiraCargaRealizada: false,
    };
    await handleSalvarConfig(atualizacoes);
    await handleVerificarAgora();
  };

  // Dispara notificação de teste
  const handleTestarNotificacao = async () => {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      await chrome.runtime.sendMessage({ tipo: 'TESTAR_NOTIFICACAO' });
    }
  };

  // Abre o painel lateral de forma síncrona
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

  // Alterna o radar sonoro direto pelo cabeçalho
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

  // Combinação de todos os marcadores únicos conhecidos
  const todosMarcadores = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const m of marcadoresDisponiveis) {
      if (m && m.trim()) mapa.set(m.trim().toLowerCase(), m.trim());
    }
    for (const proc of processos) {
      if (proc.marcadores) {
        for (const m of proc.marcadores) {
          if (m.nome && m.nome.trim()) mapa.set(m.nome.trim().toLowerCase(), m.nome.trim());
        }
      }
    }
    if (config?.marcadoresRadar) {
      for (const m of config.marcadoresRadar) {
        if (m && m.trim()) mapa.set(m.trim().toLowerCase(), m.trim());
      }
    }
    if (config?.marcadoresNotificacao) {
      for (const m of config.marcadoresNotificacao) {
        if (m && m.trim()) mapa.set(m.trim().toLowerCase(), m.trim());
      }
    }
    return Array.from(mapa.values()).sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
  }, [marcadoresDisponiveis, processos, config?.marcadoresRadar, config?.marcadoresNotificacao]);

  // Alterna marcador no onboarding
  const alternarMarcadorOnboarding = (marcador: string) => {
    const existe = onboardingMarcadores.some(
      (m) => m.toLowerCase().trim() === marcador.toLowerCase().trim()
    );
    if (existe) {
      setOnboardingMarcadores(
        onboardingMarcadores.filter((m) => m.toLowerCase().trim() !== marcador.toLowerCase().trim())
      );
    } else {
      setOnboardingMarcadores([...onboardingMarcadores, marcador]);
    }
  };

  // Alterna marcador nas configurações do radar
  const alternarMarcadorRadar = (marcador: string) => {
    if (!config) return;
    const lista = config.marcadoresRadar || [];
    const existe = lista.some((m) => m.toLowerCase().trim() === marcador.toLowerCase().trim());
    const atualizada = existe
      ? lista.filter((m) => m.toLowerCase().trim() !== marcador.toLowerCase().trim())
      : [...lista, marcador];
    setConfig({ ...config, marcadoresRadar: atualizada });
  };

  // Alterna marcador nas notificações
  const alternarMarcadorNotificacao = (marcador: string) => {
    if (!config) return;
    const lista = config.marcadoresNotificacao || [];
    const existe = lista.some((m) => m.toLowerCase().trim() === marcador.toLowerCase().trim());
    const atualizada = existe
      ? lista.filter((m) => m.toLowerCase().trim() !== marcador.toLowerCase().trim())
      : [...lista, marcador];
    setConfig({ ...config, marcadoresNotificacao: atualizada });
  };

  // Contagem de processos atribuídos a mim
  const totalMeus = useMemo(() => {
    return processos.filter((p) => ehMeuProcesso(p, config?.usuarioSigla)).length;
  }, [processos, config?.usuarioSigla]);

  const totalNaoLidos = useMemo(() => {
    return processos.filter((p) => !p.lido).length;
  }, [processos]);

  // Resumo do expediente
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
          if (
            !p.marcadores ||
            !p.marcadores.some(
              (m) => m.nome.trim().toLowerCase() === marcadorFiltro.trim().toLowerCase()
            )
          ) {
            return false;
          }
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

  // Renderização da tela de Onboarding Inicial
  if (config && !config.radarOnboardingConcluido) {
    const onboardingSemEtiquetas =
      onboardingEscopo === 'marcadores' && onboardingMarcadores.length === 0;
    const previaEscopo = descreverEscopoRadar({
      ...config,
      escopoRadar: onboardingEscopo,
      usuarioSigla: onboardingCpf || config.usuarioSigla,
      marcadoresRadar: onboardingMarcadores,
    });

    return (
      <div className="popup-container onboarding-container">
        <header className="onboarding-header">
          <div className="header-title-row">
            <span className="logo-badge">SEI!</span>
            <h1 className="title">Configure seu Radar</h1>
          </div>
          <p className="onboarding-subtitle">
            Escolha o que você quer acompanhar — leva 10 segundos.
          </p>
        </header>

        <div className="onboarding-content">
          <div className="scope-selection-list" role="radiogroup" aria-label="Escopo do Radar">
            {/* Opção 1: Atribuídos a mim (Recomendada) */}
            <label className={`scope-card ${onboardingEscopo === 'atribuidos' ? 'active' : ''}`}>
              <input
                type="radio"
                name="onboarding-escopo"
                className="scope-card-input"
                checked={onboardingEscopo === 'atribuidos'}
                onChange={() => setOnboardingEscopo('atribuidos')}
              />
              <div className="scope-card-header">
                <span className="scope-card-icon">
                  <User size={16} />
                </span>
                <div className="scope-card-info">
                  <div className="scope-card-title-row">
                    <span className="scope-title">Processos atribuídos a mim</span>
                    <span className="badge-recommendation">Recomendada</span>
                  </div>
                  <p className="scope-desc">
                    Acompanhe somente os processos que estão sob sua responsabilidade direta.
                  </p>
                </div>
                <div className="scope-card-radio">
                  <div className={`radio-dot ${onboardingEscopo === 'atribuidos' ? 'checked' : ''}`} />
                </div>
              </div>

              {onboardingEscopo === 'atribuidos' && (
                <div className="scope-card-expanded" onClick={(e) => e.stopPropagation()}>
                  <span className="scope-input-label">Seu CPF (apenas números)</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="setting-input"
                    placeholder="Ex: 00652162614"
                    value={onboardingCpf}
                    onChange={(e) =>
                      setOnboardingCpf(e.target.value.replace(/\D/g, '').slice(0, 11))
                    }
                  />
                  <span className="setting-hint">
                    Usado para reconhecer seus processos. Se não souber agora, o SEI identificará
                    automaticamente ao abrir.
                  </span>
                </div>
              )}
            </label>

            {/* Opção 2: Todos os processos da unidade */}
            <label className={`scope-card ${onboardingEscopo === 'unidade' ? 'active' : ''}`}>
              <input
                type="radio"
                name="onboarding-escopo"
                className="scope-card-input"
                checked={onboardingEscopo === 'unidade'}
                onChange={() => setOnboardingEscopo('unidade')}
              />
              <div className="scope-card-header">
                <span className="scope-card-icon">
                  <Inbox size={16} />
                </span>
                <div className="scope-card-info">
                  <span className="scope-title">Todos os processos da unidade</span>
                  <p className="scope-desc">
                    Monitore toda a caixa de entrada da unidade, recebendo visibilidade completa.
                  </p>
                </div>
                <div className="scope-card-radio">
                  <div className={`radio-dot ${onboardingEscopo === 'unidade' ? 'checked' : ''}`} />
                </div>
              </div>
            </label>

            {/* Opção 3: Com etiquetas da unidade */}
            <label className={`scope-card ${onboardingEscopo === 'marcadores' ? 'active' : ''}`}>
              <input
                type="radio"
                name="onboarding-escopo"
                className="scope-card-input"
                checked={onboardingEscopo === 'marcadores'}
                onChange={() => setOnboardingEscopo('marcadores')}
              />
              <div className="scope-card-header">
                <span className="scope-card-icon">
                  <Tag size={16} />
                </span>
                <div className="scope-card-info">
                  <span className="scope-title">Processos com etiquetas da unidade</span>
                  <p className="scope-desc">
                    Filtre apenas os processos que contenham etiquetas de seu interesse.
                  </p>
                </div>
                <div className="scope-card-radio">
                  <div className={`radio-dot ${onboardingEscopo === 'marcadores' ? 'checked' : ''}`} />
                </div>
              </div>

              {onboardingEscopo === 'marcadores' && (
                <div className="scope-card-expanded" onClick={(e) => e.stopPropagation()}>
                  <span className="scope-input-label">Selecione as etiquetas da sua unidade:</span>
                  {todosMarcadores.length === 0 ? (
                    <div className="empty-markers-tip">
                      <p>Nenhuma etiqueta foi extraída do SEI ainda.</p>
                      <button
                        type="button"
                        className="btn-open-sei-inline"
                        onClick={() => handleAbrirSei()}
                      >
                        <ExternalLink size={12} />
                        Abrir SEI para carregar etiquetas
                      </button>
                    </div>
                  ) : (
                    <div className="markers-selection-wrap">
                      {todosMarcadores.map((m) => {
                        const selecionado = onboardingMarcadores.some(
                          (x) => x.toLowerCase().trim() === m.toLowerCase().trim()
                        );
                        return (
                          <button
                            key={m}
                            type="button"
                            className={`marker-select-chip ${selecionado ? 'selected' : ''}`}
                            onClick={() => alternarMarcadorOnboarding(m)}
                          >
                            <Tag size={10} />
                            {m}
                            {selecionado && <Check size={10} style={{ marginLeft: 2 }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </label>
          </div>
        </div>

        <footer className="onboarding-footer">
          <p className="onboarding-preview">
            Você vai acompanhar: <strong>{previaEscopo}</strong>
          </p>

          <button
            className="btn-primary-full btn-cta"
            onClick={handleConcluirOnboarding}
            disabled={carregando || onboardingSemEtiquetas}
            title={onboardingSemEtiquetas ? 'Selecione ao menos uma etiqueta' : undefined}
          >
            Ativar radar
            <ArrowRight size={14} />
          </button>

          <button
            type="button"
            className="btn-skip-onboarding"
            onClick={handleConfigurarDepois}
            disabled={carregando}
          >
            Configurar depois
          </button>

          <p className="onboarding-privacy-note">
            <ShieldCheck size={13} />
            Tudo fica no seu navegador. Nada é alterado no SEI para outras pessoas.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="popup-container">
      {/* Cabeçalho */}
      <header className="header">
        <div className="header-title-row">
          <span className="logo-badge">SEI!</span>
          <h1 className="title">Radar</h1>
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
              title={config.somAtivo ? 'Desativar radar sonoro' : 'Ativar radar sonoro'}
              aria-label={config.somAtivo ? 'Desativar radar sonoro' : 'Ativar radar sonoro'}
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

      {/* Barra de Escopo do Radar */}
      {config && !exibindoConfig && (
        <div className="radar-scope-bar">
          <div className="radar-scope-info">
            <Target size={13} className="radar-icon" />
            <span className="radar-scope-label">Radar:</span>
            <span className="radar-scope-desc">{descreverEscopoRadar(config)}</span>
          </div>
          <div className="radar-scope-actions">
            <button
              className={`btn-clear-scope ${confirmandoLimpeza ? 'confirmando' : ''}`}
              onClick={handleLimparProcessos}
              title="Remover todos os processos já sincronizados"
            >
              <Trash2 size={11} />
              {confirmandoLimpeza ? 'Confirmar?' : 'Limpar'}
            </button>
            <button
              className="btn-change-scope"
              onClick={() => setExibindoConfig(true)}
              title="Alterar escopo do radar"
            >
              Alterar
            </button>
          </div>
        </div>
      )}

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
          <button
            type="button"
            className="btn-voltar-inicio"
            onClick={() => setExibindoConfig(false)}
          >
            <ArrowLeft size={14} />
            Voltar para os processos
          </button>

          {/* Seção 1: Radar Pessoal */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Target size={14} />
              <span>Radar Pessoal</span>
            </div>

            <div className="setting-group">
              <label className="setting-label">Escopo de Monitoramento</label>
              <select
                className="setting-select"
                value={config.escopoRadar || 'atribuidos'}
                onChange={(e) =>
                  setConfig({ ...config, escopoRadar: e.target.value as EscopoRadar })
                }
              >
                <option value="atribuidos">Apenas processos atribuídos a mim (Recomendada)</option>
                <option value="unidade">Todos os processos da unidade</option>
                <option value="marcadores">Apenas com etiquetas da unidade selecionadas</option>
              </select>
              <span className="setting-hint">
                Define quais processos são monitorados, armazenados e exibidos na extensão.
              </span>
            </div>

            {config.escopoRadar === 'atribuidos' && (
              <div className="setting-group">
                <label className="setting-label">Seu CPF no SEI</label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="setting-input"
                  value={config.usuarioSigla}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      usuarioSigla: e.target.value.replace(/\D/g, '').slice(0, 11),
                    })
                  }
                  placeholder="Ex: 00652162614"
                />
                <span className="setting-hint">
                  Apenas números. Se deixar em branco, tentará capturar automaticamente do SEI.
                </span>
              </div>
            )}

            {config.escopoRadar === 'marcadores' && (
              <div className="setting-group">
                <label className="setting-label">Etiquetas do Radar</label>
                {todosMarcadores.length === 0 ? (
                  <div className="empty-markers-tip">
                    <p>Nenhuma etiqueta foi extraída do SEI ainda.</p>
                    <button
                      type="button"
                      className="btn-open-sei-inline"
                      onClick={() => handleAbrirSei()}
                    >
                      <ExternalLink size={12} />
                      Abrir SEI para carregar etiquetas
                    </button>
                  </div>
                ) : (
                  <div className="markers-selection-wrap">
                    {todosMarcadores.map((m) => {
                      const selecionado = (config.marcadoresRadar || []).some(
                        (x) => x.toLowerCase().trim() === m.toLowerCase().trim()
                      );
                      return (
                        <button
                          key={m}
                          type="button"
                          className={`marker-select-chip ${selecionado ? 'selected' : ''}`}
                          onClick={() => alternarMarcadorRadar(m)}
                        >
                          <Tag size={10} />
                          {m}
                          {selecionado && <Check size={10} style={{ marginLeft: 2 }} />}
                        </button>
                      );
                    })}
                  </div>
                )}
                <span className="setting-hint">
                  As etiquetas são obtidas diretamente do SEI (somente leitura).
                </span>
              </div>
            )}
          </div>

          {/* Seção 2: Notificações e Alertas */}
          <div className="settings-section">
            <div className="settings-section-title">
              <Bell size={14} />
              <span>Notificações e Alertas</span>
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
                <option value="todos">Todos os processos dentro do Radar</option>
                <option value="atribuidos">Apenas novos processos atribuídos a mim</option>
                <option value="atribuidos_e_marcadores">
                  Atribuídos a mim OU com etiquetas específicas
                </option>
              </select>
            </div>

            {config.regraNotificacao === 'atribuidos_e_marcadores' && (
              <div className="setting-group">
                <label className="setting-label">Etiquetas para Notificar</label>
                <div className="markers-selection-wrap">
                  {todosMarcadores.map((m) => {
                    const selecionado = (config.marcadoresNotificacao || []).some(
                      (x) => x.toLowerCase().trim() === m.toLowerCase().trim()
                    );
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`marker-select-chip ${selecionado ? 'selected' : ''}`}
                        onClick={() => alternarMarcadorNotificacao(m)}
                      >
                        <Tag size={10} />
                        {m}
                        {selecionado && <Check size={10} style={{ marginLeft: 2 }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="setting-toggle-row">
              <div>
                <div className="setting-label">Notificações no Sistema</div>
                <div className="setting-toggle-desc">
                  Avisar no canto da tela quando novos processos entrarem no Radar
                </div>
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
                <div className="setting-label">Radar Sonoro</div>
                <div className="setting-toggle-desc">
                  Emitir som discreto ao receber novidades no Radar
                </div>
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
          </div>

          {/* Seção 3: Conexão e Sincronização */}
          <div className="settings-section">
            <div className="settings-section-title">
              <SlidersHorizontal size={14} />
              <span>Conexão e Intervalo</span>
            </div>

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
          </div>

          <button className="btn-primary-full" onClick={() => handleSalvarConfig()}>
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
                placeholder="Buscar no Radar por número, assunto, marcador..."
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
                  Todas Etiquetas
                </button>
                {todosMarcadores.map((marcador) => {
                  const ativo =
                    marcadorFiltro?.trim().toLowerCase() === marcador.trim().toLowerCase();
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
                    <p>Nenhum processo no seu Radar</p>
                    <span>
                      {config?.escopoRadar === 'atribuidos'
                        ? 'Não há processos atribuídos ao seu CPF no momento.'
                        : config?.escopoRadar === 'marcadores'
                        ? 'Não há processos com as etiquetas selecionadas.'
                        : 'Sincronize para trazer os processos do SEI para o Radar.'}
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
                        {!proc.lido && !proc.motivoAtualizacao && (
                          <span className="badge-new">Novo</span>
                        )}
                      </div>
                    </div>

                    <div className="process-subject">
                      {proc.assunto || 'Sem assunto especificado'}
                    </div>

                    {proc.marcadores && proc.marcadores.length > 0 && (
                      <div className="card-markers-row">
                        {proc.marcadores.map((m) => {
                          const expandido =
                            marcadorExpandido?.numero === proc.numero &&
                            marcadorExpandido?.nome === m.nome;
                          return (
                            <button
                              key={m.nome}
                              type="button"
                              className={`card-marker-badge ${m.texto ? 'has-text' : ''} ${
                                expandido ? 'expanded' : ''
                              }`}
                              title={m.texto || m.nome}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!m.texto) return;
                                setMarcadorExpandido(
                                  expandido ? null : { numero: proc.numero, nome: m.nome }
                                );
                              }}
                            >
                              {m.nome}
                              {m.texto &&
                                (expandido ? (
                                  <ChevronUp size={9} style={{ marginLeft: 2 }} />
                                ) : (
                                  <ChevronDown size={9} style={{ marginLeft: 2 }} />
                                ))}
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
