# Guia de Instalação e Uso do SEI RADAR

Este guia foi elaborado para você e seus colegas de equipe instalarem e utilizarem o **SEI RADAR** (Radar SEI) no dia a dia com facilidade.

---

## Requisitos

- Qualquer computador com **Google Chrome**, **Microsoft Edge** ou **Brave Browser**.
- Acesso à internet e login regular no SEI (ex: SEI!MG ou SEI do seu órgão).

---

## Passo a Passo de Instalação

### Opção A: Para quem recebeu a pasta `dist` já gerada (Colegas sem Node.js)

Se você compactou e enviou a pasta `dist` para um colega:
1. Descompacte a pasta `dist` em qualquer local (ex: `Documentos/SEI-Radar-dist`).
2. Abra o Chrome ou Edge e digite na barra de endereços:
   - `chrome://extensions` (Chrome / Brave)
   - `edge://extensions` (Edge)
3. No canto superior direito, ative a opção **Modo do desenvolvedor**.
4. Clique no botão **Carregar sem compactação** (no canto superior esquerdo).
5. Selecione a pasta `dist`.
6. Pronto! A extensão aparecerá na lista de extensões instaladas.

---

### Opção B: Para Desenvolvedores (Gerando a partir do código-fonte)

1. Clone ou abra o projeto:
   ```bash
   npm install
   npm run build
   ```
2. A pasta `dist` será gerada com os arquivos empacotados.
3. Carregue a pasta `dist` no navegador via `chrome://extensions` conforme a Opção A.

---

## Fixando o Ícone na Barra do Navegador

Para acompanhar os alertas facilmente:
1. Clique no ícone de Extensões (peça de encaixe) ao lado da barra de endereços do Chrome/Edge.
2. Localize **SEI Radar** e clique no botão de **Fixar** (ícone de alfinete).
3. O ícone do SEI ficará sempre visível no navegador com um contador numérico quando houver novos processos não lidos.

---

## Como Usar

### 1. Conectar e Sincronizar
- Faça login normal no SEI no seu navegador.
- Clique no ícone do **SEI Radar** na barra de ferramentas.
- Clique no botão **"Abrir SEI"** se ainda não estiver na página de controle.
- Existem duas formas de manter o Radar sincronizado, e você pode usar as duas:
  1. **Deixar uma aba do SEI aberta** — a extensão lê os processos direto da tela, a cada 5 minutos (configurável), sem pedir nenhuma permissão extra.
  2. **Verificação em segundo plano, sem precisar de aba aberta** — na tela de Configurações, ao clicar em **"Salvar"** com a URL do SEI preenchida, o navegador vai pedir permissão de acesso apenas àquele domínio do SEI (disponível para domínios `.gov.br`, `.jus.br`, `.leg.br`, `.mp.br` e `.def.br`). Se você conceder, o Radar consegue verificar novidades mesmo com o navegador minimizado ou sem nenhuma aba do SEI aberta.
- Se você não conceder essa permissão, nada quebra: o Radar simplesmente continua sincronizando normalmente sempre que houver uma aba do SEI aberta.

### 2. Receber Alertas
- Quando um novo processo chegar na sua unidade (ou no seu Radar), uma notificação aparecerá no canto da tela com o **Número do processo** e o **Assunto**.
- Clicar na notificação abrirá o processo diretamente em uma nova aba do SEI.
- **A primeira sincronização não emite notificações.** Ela serve apenas para fotografar o que já existia no SEI — do contrário, você teria que fechar dezenas de avisos de processos antigos. A partir daí, só o que chegar de novo é notificado.
- Para não lotar a tela, cada verificação emite no máximo 4 avisos individuais. Havendo mais, o restante vira um único aviso de resumo ("Mais N processos novos chegaram").

### 3. Visualizar, Filtrar e Buscar
- Digite qualquer palavra no campo de busca para filtrar por número, assunto, atribuição ou etiqueta.
- Logo abaixo, a linha de filtros mostra a situação com as respectivas contagens:
  - **Todos** — tudo que está no seu Radar.
  - **A mim** — processos atribuídos ao seu CPF.
  - **Novos** — ainda não marcados como lidos.
  - **Sem atribuição** — ainda não distribuídos a ninguém. Útil para a secretaria ver o que falta encaminhar.
  - **Atribuídos** — já estão com outra pessoa.
  - **Com prazo** — têm retorno programado.
- Ao lado ficam os seletores de **Período** (Todos, Hoje, Ontem) e de **Etiqueta**, mais dois botões de ícone: consultar o andamento em lote e marcar todos como lidos.
- Os filtros escolhidos são lembrados quando você fecha e reabre o painel.
- Clique em **"Marcar lido"** no card para tirá-lo da contagem de novos.

> **Observação:** os filtros "Sem atribuição" e "Atribuídos" só fazem sentido com o escopo do Radar em **"Todos os processos da unidade"**. No escopo "Atribuídos a mim", a extensão guarda apenas os seus processos, então esses filtros aparecem vazios — e o próprio painel oferece um atalho para trocar o escopo.

### 4. Consultar o Andamento de um Processo
A tela de controle do SEI não mostra de onde o processo veio nem quando foi enviado. O Radar busca isso para você:

- Clique em **"Andamento"** no rodapé do card. A extensão consulta o histórico do processo no SEI e mostra:
  - **Unidade geradora** — onde o processo foi aberto.
  - **Enviado por** — a última unidade que remeteu o processo até você.
  - **Data de envio** — quando essa remessa aconteceu.
  - **Última atualização** — data e hora da movimentação mais recente.
  - **Descrição** — o que foi essa movimentação.
- O link **"Ver andamento completo no SEI"** abre a tela original, com todos os registros.
- O botão com ícone de relógio, na linha de filtros, consulta o andamento de **todos os processos visíveis** de uma vez, mostrando o progresso.
- Os resultados ficam em cache por 6 horas, para não repetir consultas. Se algo falhar, o card mostra o motivo e um botão **"Tentar de novo"**.

> **Por que às vezes aparece "—" na unidade geradora?** Em processos com histórico muito longo, o SEI divide a lista em páginas e a abertura do processo fica na página mais antiga. Nesses casos o Radar prefere não exibir nada a exibir uma unidade errada. Os demais campos continuam corretos.

### 5. Prazos
- Processos com retorno programado exibem a data em um selo no card.
- Quando o prazo já passou, o selo fica **vermelho**.
- O filtro **"Com prazo"** isola todos eles.

### 6. Configurar
- Clique no ícone de engrenagem no canto superior direito do popup para:
  - Definir o escopo do Radar (Atribuídos a mim, Todos da unidade ou Etiquetas selecionadas).
  - Alterar o intervalo de verificação (1, 2, 5, 10 ou 15 minutos).
  - Ativar ou desativar o radar sonoro.
  - Ativar ou desativar as notificações na área de trabalho.
  - Testar uma notificação de exemplo.

---

## Perguntas Frequentes e Solução de Problemas

#### A extensão mostra "Faça login no SEI" ou "Desconectado"
- O SEI encerra a sessão por inatividade após um tempo. Basta clicar no botão **"Abrir SEI"** e efetuar login novamente. Na próxima checagem periódica, a extensão reconectará automaticamente.

#### As notificações na área de trabalho não aparecem
- Verifique se o Windows/Linux não está no modo "Não Perturbe" ou "Assistente de Foco".
- No Chrome/Edge, certifique-se de que as notificações do navegador estão autorizadas nas configurações do sistema operacional.

#### É seguro usar no computador de trabalho?
- **Sim.** A extensão é somente leitura: todas as requisições ao SEI são do tipo `GET` e nenhuma parte do código escreve na página — não há envio de formulário, clique automatizado nem alteração de conteúdo. Não executa códigos externos e roda estritamente dentro do seu navegador, sem servidores intermediários.

#### O navegador avisa "Ler e alterar seus dados". A extensão altera algo no SEI?
- **Não altera nada.** Esse texto é fixo do Chrome e descreve o que a permissão *habilita*, não o que a extensão *faz* — não existe permissão de leitura sem escrita no navegador, então qualquer extensão que leia páginas mostra essa mesma frase.
- O que dá para controlar é o **alcance**, e ele foi restringido: o aviso lista apenas os domínios institucionais (`.gov.br`, `.jus.br`, `.leg.br`, `.mp.br`, `.def.br`), e não "todos os sites".

#### O filtro "Sem atribuição" aparece zerado
- Verifique o escopo do Radar na barra superior do painel. Em **"Atribuídos a mim"**, a extensão só guarda os seus processos, então nunca haverá processos sem atribuição na lista. Troque para **"Todos os processos da unidade"** — o próprio painel oferece o atalho.

#### O andamento mostra uma mensagem de erro
- O card informa o motivo e traz o botão **"Tentar de novo"**. As falhas são reconsultadas automaticamente após alguns minutos.
- Se aparecer *"Sessão do SEI expirada"*, basta refazer o login e tentar novamente.
- Sem nenhuma aba do SEI aberta, a consulta depende da permissão de acesso ao domínio (a mesma da verificação em segundo plano). Mantendo uma aba aberta, funciona sem permissão alguma.

#### Os processos antigos aparecem com o assunto estranho ou sem andamento
- Dados coletados por versões anteriores podem ter ficado gravados. Use o botão **"Limpar"** na barra do Radar e sincronize de novo: a recoleta não dispara notificações, porque conta como primeira carga.

#### O navegador pediu permissão de acesso a um site do SEI. Preciso aceitar?
- Não é obrigatório. Essa permissão só é pedida quando você salva a URL do SEI nas Configurações, e serve apenas para a verificação em segundo plano (sem precisar manter uma aba do SEI aberta). Se você recusar, o Radar continua funcionando normalmente sempre que houver uma aba do SEI aberta — só não vai conseguir verificar novidades enquanto nenhuma aba estiver aberta.
