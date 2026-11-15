# Agenda Pericial na Cloudflare

Esta edição funciona com Cloudflare Workers, D1, R2 e Cloudflare Access. O código parte da versão publicada do Agenda Pericial e mantém o editor, o timbre, a numeração, o PDF, os controles de etapas e o modelo timbrado que acompanha o programa. O banco começa sem laudos, conforme solicitado. O arquivo de configurações da agenda anterior transfere modelos salvos, modelo de abertura e colunas de data. Ele não inclui laudos nem históricos.

## Preparar a conta Cloudflare

1. Instale o Node.js no computador. Abra o terminal nesta pasta.
2. Execute `npx wrangler login` e autorize pelo navegador.
3. Execute `npx wrangler d1 create agenda-pericial`. Copie o ID retornado para `database_id` em `wrangler.toml`.
4. Execute `npx wrangler d1 migrations apply agenda-pericial --remote`. Isso cria as tabelas vazias para datas, laudos, históricos e modelos.
5. Ative o R2 na conta e execute `npx wrangler r2 bucket create agenda-pericial-imagens`. Mantenha o bucket privado, com acesso público desativado. Em seguida, execute `npx wrangler deploy` para criar o Worker e obter o endereço. Antes de configurar o Access e as variáveis, o endereço recusa acesso.
6. No painel Cloudflare Zero Trust, crie um aplicativo **Self-hosted** para o endereço do Worker. Na política **Allow**, inclua apenas o e-mail do responsável e o da perita. Habilite o método de login que os dois usarão. Copie o domínio da equipe e o **Application Audience (AUD)** para `wrangler.toml`. Referência: [Proteger um endereço com Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).
7. Execute `npx wrangler secret put AGENDA_OWNER_EMAIL` e informe o e-mail do responsável no terminal. Repita com `npx wrangler secret put AGENDA_INITIAL_REVIEWER_EMAIL` para a perita.
8. Execute `npx wrangler deploy` novamente. O responsável deve abrir a nova agenda primeiro para inicializar as duas funções.

## Transferir configurações e conferir

1. Na agenda anterior, entre como responsável e clique em **Exportar configurações**.
2. Na nova agenda vazia, clique em **Importar configurações** e selecione `agenda-pericial-configuracoes.json`.
3. Confira os modelos salvos e o modelo de abertura. Com um processo fictício, teste a edição, a troca de etapa, a colagem de uma imagem e a geração do PDF pelo novo endereço. Abra o endereço em janela anônima e confirme que ele exige autenticação. Teste também o acesso da perita.
4. A agenda anterior pode continuar disponível durante a conferência. A exclusão do site anterior é uma operação separada.

## Armazenamento

O limite antigo de 850 KB para toda a agenda foi removido. Laudos, entradas de histórico e modelos ficam em registros separados no D1. O painel carrega apenas o resumo dos processos, e o editor busca o texto e o histórico do laudo selecionado. Limites no código desta versão: 10.000 processos, 5.000 datas, 50 mil caracteres de texto por laudo e até oito versões de histórico.

No editor, pressione **Ctrl+V** com uma imagem PNG ou JPEG de até 5 MB na área de transferência. Ela é inserida abaixo do parágrafo atual. Clique em **Salvar laudo** para persistir a posição. Os dois perfis autorizados conseguem visualizá-la e gerar o PDF. Use o **×** da imagem para retirá-la do documento. A retirada remove a referência do laudo salvo. O arquivo no R2 é mantido para não quebrar versões abertas ou modelos que apontem para ele. Uma cópia do D1 cobre dados e referências. Para um backup completo, copie também os objetos do R2.

Para exportar uma cópia do banco da Cloudflare, use `npx wrangler d1 export agenda-pericial --remote --output backup.sql` e guarde o arquivo em local protegido. Consulte os [limites do D1](https://developers.cloudflare.com/d1/platform/limits/) para verificar a capacidade do plano contratado.
