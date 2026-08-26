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
1. Descompacte a pasta `dist` em qualquer local (ex: `Documentos/SEI-Notifier-dist`).
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

### 3. Visualizar e Buscar
- No painel da extensão, digite qualquer palavra no campo de busca para filtrar processos pelo número ou pelo texto do assunto.
- Clique em **"Novo"** ou **"Marcar lido"** para gerenciar os processos que você já visualizou.

### 4. Configurar
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
- **Sim, 100% seguro.** A extensão é somente leitura, não modifica dados no SEI, não executa códigos externos e roda estritamente dentro do seu próprio navegador sem servidores intermediários.

#### O navegador pediu permissão de acesso a um site do SEI. Preciso aceitar?
- Não é obrigatório. Essa permissão só é pedida quando você salva a URL do SEI nas Configurações, e serve apenas para a verificação em segundo plano (sem precisar manter uma aba do SEI aberta). Se você recusar, o Radar continua funcionando normalmente sempre que houver uma aba do SEI aberta — só não vai conseguir verificar novidades enquanto nenhuma aba estiver aberta.
