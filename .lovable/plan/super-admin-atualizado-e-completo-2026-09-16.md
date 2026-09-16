# Super Admin atualizado e completo

## Objetivo

Transformar `/admin` em um centro de operação da plataforma atual, com navegação clara, indicadores úteis, gestão segura e cobertura dos recursos que hoje existem no banco mas não aparecem no painel administrativo.

## O que será construído

### 1. Estrutura e navegação
- Reorganizar o Admin em grupos: **Operação**, **Comercial**, **Plataforma** e **Governança**.
- Manter as áreas atuais, mas reduzir a lista extensa de abas com navegação lateral no computador e seletor compacto no celular.
- Mostrar título, descrição e ações próprias em cada área, preservando a identidade visual configurável.
- Dividir a página atual em componentes menores para facilitar manutenção sem mudar URLs públicas.

### 2. Visão geral operacional
- Atualizar o resumo com lojas ativas/publicadas, pedidos e faturamento do período, MRR, assinaturas em risco, tickets, incidentes, solicitações LGPD e integrações conectadas.
- Adicionar blocos de atenção com ações rápidas para cobranças vencidas, lojas sem plano, falhas de pagamento, documentos fiscais com erro e WhatsApp desconectado.
- Incluir distribuição por segmento, plano e situação da assinatura.
- Diferenciar claramente receita processada pelas lojas da receita de assinaturas da plataforma.

### 3. Gestão de lojas e usuários
- Melhorar busca e filtros de lojas por situação, publicação, plano e segmento.
- Exibir proprietário, plano, assinatura, último pedido, volume recente e estado das integrações.
- Manter criação, edição, ativação e acesso temporário de suporte; proteger exclusão com confirmação explícita.
- Completar usuários com data de cadastro, último acesso, vínculos com lojas e papel administrativo.
- Adicionar paginação para não limitar a gestão aos primeiros usuários/lojas.

### 4. Planos, assinaturas e cobrança
- Preservar o editor completo de planos, módulos, limites, ordenação, prévia e geração de destaques.
- Consolidar assinaturas e cobranças em uma visão comercial com filtros, totais e situação por loja.
- Sinalizar inadimplência, teste próximo do fim, cancelamentos e lojas sem assinatura.
- Manter pagamento, cancelamento e reembolso de cobranças com registro de auditoria.

### 5. Saúde da plataforma
- Criar uma área de saúde com integrações globais, WhatsApp, pagamentos, emissão fiscal, notificações e filas operacionais.
- Mostrar estado configurado/conectado/erro, última verificação e quantidade de lojas afetadas.
- Adicionar indicadores de falhas recentes em pagamentos, reembolsos, notas fiscais, webhooks e mensagens.
- Reaproveitar as telas atuais de Integrações e Evolution API dentro desta organização.

### 6. Suporte, incidentes e comunicação
- Aprimorar tickets com filtros por prioridade/situação, loja identificada, tempo em aberto e indicador de SLA.
- Manter acessos temporários auditados e destacar sessões ainda ativas.
- Completar incidentes com descrição, severidade, situação, período e comunicação visível na plataforma.
- Preservar banners, perguntas frequentes e segmentos, adicionando edição e ordenação em vez de apenas criação/exclusão.

### 7. Privacidade e governança
- Adicionar solicitações LGPD com tipo, loja/cliente, prazo, situação, responsável, observação e conclusão.
- Melhorar os logs com filtros por ação, entidade, loja, usuário e período.
- Exibir um resumo de segurança e configuração, incluindo alertas do banco que exigem revisão manual.
- Toda ação administrativa crítica deverá registrar auditoria.

## Regras de segurança

- Todas as leituras e alterações administrativas sensíveis passarão por funções protegidas no servidor.
- A permissão `super_admin` será validada no servidor antes de qualquer acesso privilegiado.
- Segredos de integrações continuarão mascarados e nunca serão enviados ao navegador.
- Nenhuma política de acesso ou estrutura do banco será ampliada sem necessidade; a atualização usará as tabelas existentes.
- A remoção de loja exigirá confirmação digitada e mostrará o impacto antes da execução.

## Detalhes técnicos

- Extrair o arquivo administrativo monolítico em componentes por domínio e funções tipadas.
- Centralizar consultas em `superadmin.functions.ts`, com validação Zod, paginação e retornos resumidos.
- Usar TanStack Query para cache, filtros e atualização após ações.
- Criar estados de carregamento, vazio e erro em todas as áreas.
- Manter o Admin protegido sob a área autenticada e preservar os recursos já existentes.
- Não criar novas tabelas nesta etapa; utilizar `stores`, `profiles`, `user_roles`, `store_subscriptions`, `subscription_invoices`, `support_tickets`, `platform_incidents`, `data_requests`, `audit_logs`, `payments`, `refunds`, `fiscal_invoices`, integrações e WhatsApp.

## Validação

- Testar acesso de super admin e bloqueio de usuários comuns.
- Validar filtros, paginação, criação/edição, alterações de plano, cobrança, suporte, incidentes e LGPD.
- Conferir a experiência em celular e computador, sem sobreposição ou rolagem lateral.
- Executar testes direcionados, verificação de tipos, logs do navegador e checagem de segurança das funções administrativas.
