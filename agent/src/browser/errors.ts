export class ErroSessaoExpirada extends Error {
  public constructor(mensagem = 'A sessão do SEI expirou') {
    super(mensagem);
    this.name = 'ErroSessaoExpirada';
  }
}

export class ErroLayout extends Error {
  public constructor(mensagem = 'A estrutura esperada da página do SEI não foi encontrada') {
    super(mensagem);
    this.name = 'ErroLayout';
  }
}
