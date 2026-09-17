# Painel do cliente logado

## Objetivo

Transformar a área autenticada **Minha conta** em um painel simples e mobile-first, onde o cliente consulte pedidos atuais, histórico e endereços salvos usando a mesma conta criada no checkout.

## O que será feito

1. **Visão geral do cliente**
   - Cabeçalho com saudação, acesso às lojas e ação de sair.
   - Resumo com pedidos em andamento, total de pedidos e quantidade de endereços salvos.
   - Destaque do pedido ativo mais recente com acesso rápido ao acompanhamento.

2. **Pedidos e histórico**
   - Separar pedidos em **Em andamento** e **Histórico**.
   - Exibir loja, número, data, valor, tipo e situação do pedido.
   - Manter ações para acompanhar e comprar novamente.
   - Criar estados completos de carregamento, lista vazia e erro com tentativa novamente.

3. **Endereços salvos**
   - Listar endereços com indicação clara do principal.
   - Permitir cadastrar, editar, excluir e definir o endereço padrão.
   - Usar o mesmo cadastro de endereços já consumido pelo checkout, sem duplicar dados.
   - Confirmar exclusões e impedir mudanças inconsistentes no endereço principal.

4. **Navegação e experiência**
   - Organizar o painel em abas claras: **Início**, **Pedidos**, **Endereços** e **Meus dados**.
   - Adaptar a navegação para uso confortável no celular, preservando o visual Pedi Um.
   - Direcionar os acessos existentes da área do cliente autenticado para este painel.
   - Manter a consulta pública por código separada para quem ainda não entrou.

## Segurança e dados

- Buscar pedidos e endereços somente com a sessão validada no servidor.
- Vincular o histórico pelo usuário autenticado, mantendo compatibilidade controlada com pedidos antigos já confirmados pelo telefone.
- Validar no servidor todas as alterações de endereço e garantir que cada cliente acesse somente os próprios registros.
- Revisar as regras atuais de acesso antes de qualquer ajuste no banco; criar migração apenas se houver uma lacuna real.

## Validação

- Testar cliente com e sem pedidos, pedidos em andamento e concluídos.
- Testar cadastro, edição, exclusão e troca de endereço principal.
- Confirmar isolamento entre contas e ausência de acesso a pedidos/endereço de outro cliente.
- Verificar o painel em celular e desktop, incluindo carregamento, vazio, erro e saída da conta.

## Detalhes técnicos

- Reaproveitar a rota autenticada de **Minha conta**, os componentes de pedidos e as tabelas `customer_profiles`, `orders` e `saved_addresses`.
- Migrar leituras e alterações sensíveis para funções autenticadas no servidor com TanStack Query para cache e atualização.
- Remover do painel os blocos antigos de produtos digitais, pois não fazem parte do foco atual da plataforma.
