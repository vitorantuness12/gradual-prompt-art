# Checkout com acesso obrigatório e endereços salvos

## Objetivo

Remover o bloco atual de identificação por telefone exibido no início do checkout. O cliente monta e revisa a compra normalmente; ao confirmar, entra ou cria uma conta, escolhe o endereço e somente então o pedido é enviado.

## Fluxo proposto

1. **Checkout sem interrupção inicial**
   - Retirar o bloco “Informe seu número de telefone”, os consentimentos e a recuperação antecipada de dados.
   - Manter itens, entrega/retirada, cupom, pagamento e revisão no fluxo atual.
   - Preservar os dados preenchidos e o carrinho durante login, cadastro, confirmação de código e recuperação de senha.

2. **Acesso obrigatório ao finalizar**
   - Ao tocar em “Confirmar pedido”, abrir uma etapa de acesso com duas ações claras: **Entrar** e **Criar cadastro**.
   - Em **Entrar**, oferecer:
     - “Entrar com código”: informar e-mail ou WhatsApp, mostrar apenas os canais disponíveis de forma mascarada, escolher onde receber e confirmar o código de 6 dígitos.
     - “Entrar com e-mail e senha”.
     - “Esqueci minha senha”, enviando o link para a tela pública de redefinição já existente.
   - Aplicar validade de 10 minutos, reenvio com espera, invalidação do código anterior, limite de tentativas e mensagens que não revelem se uma conta existe.
   - Após autenticar, voltar automaticamente à revisão do mesmo pedido.

3. **Cadastro de cliente**
   - Formulário dedicado e simples para nome, e-mail, WhatsApp, senha, confirmação de senha, aceite dos Termos/Privacidade e consentimento opcional de marketing.
   - Criar o perfil completo do cliente e vincular compras anteriores compatíveis pelo telefone confirmado, sem misturar dados de pessoas diferentes.
   - Respeitar a confirmação de e-mail configurada no Supabase e retomar o checkout após a conta ficar ativa.

4. **Endereços após o acesso**
   - Para entrega, mostrar primeiro os endereços salvos da conta, com o endereço padrão pré-selecionado.
   - Permitir selecionar outro endereço, cadastrar um novo, nomeá-lo (Casa, Trabalho ou outro) e marcar “Usar como endereço padrão”.
   - Permitir vários endereços e evitar duplicar um endereço já salvo a cada novo pedido.
   - Disponibilizar edição, exclusão e troca do endereço padrão na área **Minha conta**.
   - Para retirada ou consumo no local, pular a escolha de endereço.

5. **Criação segura do pedido**
   - Exigir uma sessão válida no servidor em todos os fluxos ativos de checkout antes de criar o pedido.
   - Associar o pedido ao cliente autenticado e ao cadastro daquela loja.
   - Revalidar preço, estoque, cupom, cashback, frete, forma de pagamento e endereço no envio final.
   - Depois do sucesso, limpar o carrinho e abrir o acompanhamento do pedido como hoje.

6. **Unificação da área do cliente**
   - Substituir a sessão paralela de 12 horas por telefone em **Meus pedidos** pela mesma conta usada no checkout.
   - Manter histórico, repetir pedido, cashback, assinaturas, avisos e acompanhamento disponíveis após o login.
   - Exibir estado de conta e ação de sair de forma consistente nas páginas do cliente.

## Banco de dados e segurança

- Reaproveitar `customer_profiles`, `customers`, `customer_addresses` e `saved_addresses`, eliminando os dois caminhos desconectados de endereço.
- Vincular com segurança o perfil global ao cadastro do cliente em cada loja; não armazenar papel de usuário no perfil.
- Ajustar as regras de acesso para que cada cliente veja e altere somente seus dados e endereços, enquanto a equipe da loja mantém o acesso operacional necessário.
- Todas as funções de leitura e criação de pedido validarão a sessão no servidor; o bloqueio visual da tela não será tratado como segurança.
- Validar todos os campos no navegador e novamente no servidor.

## Experiência e compatibilidade

- Interface mobile-first, seguindo as cores da loja e o estilo atual do checkout, sem redesenhar catálogo ou carrinho.
- Estados completos de carregamento, envio, código expirado, bloqueio, erro, conta não confirmada e sessão perdida.
- Preservar pedidos e clientes antigos; a vinculação acontece progressivamente após confirmação segura de telefone ou e-mail.
- Aplicar o novo portão de acesso ao checkout principal e aos checkouts físicos/agendados ainda ativos, evitando caminhos que permitam concluir sem conta.

## Validação

- Testes de login por código nos dois canais, e-mail/senha, recuperação e cadastro.
- Testes de conta inexistente, código expirado, limite de tentativas e troca de canal.
- Testes de múltiplos endereços, padrão único, edição, exclusão, deduplicação e isolamento entre clientes.
- Testes garantindo que nenhum pedido seja criado antes do acesso e que preço/estoque/frete sejam revalidados depois dele.
- Verificação em celular e desktop do fluxo completo: carrinho → revisão → acesso → endereço → pedido → acompanhamento.
