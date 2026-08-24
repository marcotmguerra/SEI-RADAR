# 📖 Guia de Instalação e Uso do SEI Notifier

Este guia foi elaborado para você e seus colegas de equipe instalarem e utilizarem o **SEI Notifier** no dia a dia com facilidade.

---

## 📋 Requisitos

- Qualquer computador com **Google Chrome**, **Microsoft Edge** ou **Brave Browser**.
- Acesso à internet e login regular no SEI (ex: SEI!MG ou SEI do seu órgão).

---

## 🚀 Passo a Passo de Instalação

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

## 📌 Fixando o Ícone na Barra do Navegador

Para acompanhar os alertas facilmente:
1. Clique no ícone de quebra-cabeça 🧩 (Extensões) ao lado da barra de endereços do Chrome/Edge.
2. Localize **SEI Notifier** e clique no ícone de **Alfinete 📌** (Fixar).
3. O ícone azul do SEI ficará sempre visível no navegador com um contador numérico quando houver novos processos não lidos.

---

## 💡 Como Usar

### 1. Conectar e Sincronizar
- Faça login normal no SEI no seu navegador.
- Clique no ícone do **SEI Notifier** na barra de ferramentas.
- Clique no botão **"Abrir SEI"** se ainda não estiver na página de controle.
- A extensão fará a checagem automática em segundo plano a cada 5 minutos (configurável).

### 2. Receber Alertas
- Quando um novo processo chegar na sua unidade, uma notificação aparecerá no canto da tela com o **Número do processo** e o **Assunto**.
- Clicar na notificação abrirá o processo diretamente em uma nova aba do SEI.

### 3. Visualizar e Buscar
- No painel da extensão, digite qualquer palavra no campo de busca para filtrar processos pelo número ou pelo texto do assunto.
- Clique em **"Novo"** ou **"Marcar lido"** para gerenciar os processos que você já visualizou.

### 4. Configurar
- Clique no ícone de engrenagem ⚙️ no canto superior direito do popup para:
  - Alterar o intervalo de verificação (1, 2, 5, 10 ou 15 minutos).
  - Ativar ou desativar o alerta sonoro.
  - Ativar ou desativar as notificações na área de trabalho.
  - Testar uma notificação de exemplo.

---

## ❓ Perguntas Frequentes e Solução de Problemas

#### A extensão mostra "Faça login no SEI" ou "Desconectado"
- O SEI encerra a sessão por inatividade após um tempo. Basta clicar no botão **"Abrir SEI"** e efetuar login novamente. Na próxima checagem periódica, a extensão reconectará automaticamente.

#### As notificações na área de trabalho não aparecem
- Verifique se o Windows/Linux não está no modo "Não Perturbe" ou "Assistente de Foco".
- No Chrome/Edge, certifique-se de que as notificações do navegador estão autorizadas nas configurações do sistema operacional.

#### É seguro usar no computador de trabalho?
- **Sim, 100% seguro.** A extensão é somente leitura, não modifica dados no SEI, não executa códigos externos e roda estritamente dentro do seu próprio navegador sem servidores intermediários.
