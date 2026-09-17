# Acesso à conta do cliente no catálogo

## Objetivo
Dar ao cliente um acesso claro à própria conta diretamente na loja online, mantendo o catálogo e o carrinho como estão.

## Implementação

1. **Adicionar “Minha conta” no catálogo**
   - Incluir um botão visível no cabeçalho da loja para computador, ao lado das ações existentes.
   - Manter e aprimorar o item “Conta” na barra inferior do celular.
   - Usar as cores configuradas pela própria loja e os componentes visuais atuais.

2. **Abrir o fluxo correto conforme a sessão**
   - Cliente conectado: abrir diretamente `/minha-conta`.
   - Cliente desconectado: abrir a tela de acesso já existente, pré-selecionada para cliente.
   - Preservar na URL a loja de origem para permitir retorno ao catálogo após entrar ou criar a conta.
   - Garantir que contas de lojista ou entregador não sejam confundidas com uma conta de cliente.

3. **Completar a experiência da conta**
   - Manter no painel os pedidos em andamento, histórico, acompanhamento e endereços salvos já implementados.
   - Ajustar “Comprar novamente” para voltar à loja correta e iniciar a recompra usando o fluxo existente, sem duplicar pedidos automaticamente.
   - Adicionar uma ação clara para retornar à loja de origem.

4. **Consistência nos acessos existentes**
   - Direcionar os atalhos públicos de “Área do cliente” e “Conta” para o painel autenticado.
   - Preservar a consulta pública por telefone/código como alternativa para quem ainda não possui conta.

5. **Validação**
   - Testar visitante e cliente conectado, redirecionamento após login, acompanhamento e recompra.
   - Conferir celular e computador, navegação por teclado, estados de carregamento/erro e ausência de sobreposição com a sacola.
   - Executar validação de tipos e testes focados nas rotas alteradas.

## Detalhes técnicos
- Reutilizar `/auth` com `perfil=cliente` e destino interno validado.
- Reutilizar `/minha-conta`, funções autenticadas e isolamento por usuário já existentes.
- Não criar novas tabelas nem alterar o modelo de autenticação nesta etapa.
