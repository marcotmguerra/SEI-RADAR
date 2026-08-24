import { ErroSessaoExpirada, ErroLayout } from './errors';

export interface SeletoresSei {
  readonly login: string;
  readonly total: string;
  readonly processos: string;
  readonly proximo: string;
}

export const SELETORES_SEI_PADRAO: SeletoresSei = Object.freeze({
  login: 'input[name="txtUsuario"], #txtUsuario, form[action*="login"]',
  total: '[data-total-registros], .infraBarraLocalizacao, #divInfraAreaTabela .infraBarraLocalizacao',
  processos:
    'a[href*="acao=procedimento_trabalhar"], a[href*="acao=procedimento_visualizar"]',
  proximo: 'a[title*="Próxima"], a[aria-label*="Próxima"], a.infraProximaPagina',
});

export interface PortaPaginaSei {
  contar(seletor: string): Promise<number>;
  texto(seletor: string): Promise<string>;
  atributo(seletor: string, nome: string): Promise<string | null>;
  textos(seletor: string): Promise<readonly string[]>;
  proximo(seletor: string): Promise<boolean>;
}

const lerContagem = (texto: string): number | null => {
  const correspondencia = texto.match(/([\d.]+)\s+registros?\b/iu);
  if (!correspondencia?.[1]) return null;
  const contagem = Number(correspondencia[1].replaceAll('.', ''));
  return Number.isSafeInteger(contagem) && contagem >= 0 ? contagem : null;
};

export class SeiFontePaginaProcessos {
  public constructor(
    private readonly pagina: PortaPaginaSei,
    private readonly seletores: SeletoresSei = SELETORES_SEI_PADRAO,
  ) {}

  private async garantirAutenticado(): Promise<void> {
    if ((await this.pagina.contar(this.seletores.login)) > 0) throw new ErroSessaoExpirada();
  }

  public async contagemEsperada(): Promise<number | null> {
    await this.garantirAutenticado();
    if ((await this.pagina.contar(this.seletores.total)) === 0) throw new ErroLayout();
    const valorAtributo = await this.pagina.atributo(this.seletores.total, 'data-total-registros');
    const valor = valorAtributo === null ? await this.pagina.texto(this.seletores.total) : valorAtributo;
    const contagem = /^\d+$/u.test(valor.trim()) ? Number(valor) : lerContagem(valor);
    if (contagem === null || !Number.isSafeInteger(contagem)) {
      throw new ErroLayout('O indicador de total do SEI não pôde ser interpretado');
    }
    return contagem;
  }

  public async numerosProcessos(): Promise<readonly string[]> {
    await this.garantirAutenticado();
    return this.pagina.textos(this.seletores.processos);
  }

  public async irProximaPagina(): Promise<boolean> {
    await this.garantirAutenticado();
    return this.pagina.proximo(this.seletores.proximo);
  }
}
