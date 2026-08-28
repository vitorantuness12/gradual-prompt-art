# O Seu Pedido

Plataforma SaaS multi-tenant onde pequenos e médios negócios criam a própria loja
(catálogo/cardápio, pedidos, agendamentos, entregas, pagamentos, CRM, marketing e
relatórios) sem depender de marketplace. Interface 100% em português do Brasil,
mobile first.

- **Stack**: TanStack Start (React 19 + Vite 7), Tailwind CSS v4, TanStack Query/Router,
  shadcn/ui, Lovable Cloud (Postgres + Auth + Storage) com RLS multi-tenant.
- **Backend**: `createServerFn` para lógica interna e rotas de servidor em
  `src/routes/api/public/*` para webhooks e chamadas externas.

## Como rodar

```bash
bun install
bun run dev          # http://localhost:8080
bun run test         # suíte de testes (Vitest)
bun run lint
bun run build        # build de produção
```

## Variáveis de ambiente

Geradas automaticamente pelo Lovable Cloud (arquivo `.env`, não editar à mão):

| Variável | Onde é lida | Para quê |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | navegador | endereço do backend |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | navegador | chave pública (respeita RLS) |
| `VITE_SUPABASE_PROJECT_ID` | navegador | identificação do projeto |
| `SUPABASE_URL` | servidor | endereço do backend |
| `SUPABASE_PUBLISHABLE_KEY` | servidor | cliente autenticado por token |
| `SUPABASE_SERVICE_ROLE_KEY` | servidor | operações privilegiadas (nunca no cliente) |

Segredos opcionais (adicionados pelo painel de backend, nunca no código):

| Segredo | Usado em |
| --- | --- |
| `RESEND_API_KEY` / `RESEND_FROM` | envio de convites de equipe e e-mails transacionais |
| `MERCADOPAGO_ACCESS_TOKEN` / `MERCADOPAGO_WEBHOOK_SECRET` | Pix e cartão online via Mercado Pago |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | cartão online e assinaturas recorrentes |
| `WHATSAPP_*` (por loja, na tela Canais) | WhatsApp Business Cloud API oficial |
| `TELEGRAM_BOT_TOKEN` (por loja) | canal Telegram |
| `PUBLIC_SITE_URL` | montar links absolutos de convite |

## Banco de dados e migrações

- Todas as mudanças de esquema entram como migração (pasta `supabase/migrations`).
- Toda tabela em `public` tem `GRANT` explícito + RLS habilitada.
- Isolamento multi-tenant: `is_store_member`, `has_store_role`, `has_store_permission`
  e `has_role` (super admin). Papéis ficam em `user_roles` e `store_members` — nunca no perfil.
- Tabelas sem política (`channel_credentials`, `channel_webhook_events`,
  `payment_webhook_events`, `rate_limits`) são acessíveis somente pelo servidor.

### Dados de demonstração

A loja **Cantinho da Praça (Exemplo)** (`/cantinho-da-praca`) já vem com categorias,
produtos, combo, serviço agendável, clientes, entregador, áreas de entrega, cupom,
pedidos em situações diferentes, pagamentos e um agendamento. Todos os registros têm
`is_demo = true` e aparecem com o selo **Exemplo** na interface.

## PDV (ponto de venda)

Em **Painel → PDV / Caixa**: venda rápida de balcão com busca por nome, SKU e código de
barras (o leitor digita no campo e envia Enter), cliente opcional, preço promocional
automático, desconto autorizado, taxa, observação e atendimento em balcão, retirada,
delivery ou mesa.

- **Caixa por turno**: abertura com saldo inicial, entradas, saídas, sangrias,
  suprimentos, saldo esperado, valor contado, diferença com justificativa obrigatória
  e histórico dos turnos.
- **Pagamento dividido**: combina dinheiro, Pix, débito, crédito e vale; cada forma vira
  uma transação e uma movimentação de caixa. A venda não conclui abaixo do total e o
  troco só sai do dinheiro.
- **Permissões**: `pos`, `pos_discount`, `pos_cancel`, `pos_reopen`, `pos_withdrawal` e
  `pos_close`, configuráveis por membro na tela de Equipe e revalidadas no servidor.
- **Integração**: baixa de estoque com movimentação registrada, cancelamento devolve o
  estoque e estorna, cupom impresso pelo módulo de impressão, vendas entram em pedidos e
  relatórios, e pedidos online chegam em tempo real com alerta na tela.

## Segurança

- RLS por loja em todas as tabelas de negócio; políticas públicas só para vitrine.
- Colunas sensíveis da loja (CNPJ, razão social, dono, onboarding) fora do alcance de visitantes.
- Validação com Zod no cliente **e** no servidor; sanitização de texto livre (`sanitizeText`).
- Rate limiting no banco (`consume_rate_limit`) para login, cadastro, cupom, checkout,
  pagamento, rastreio, convites e webhooks.
- CSRF ativo em server functions (`createCsrfMiddleware` em `src/start.ts`).
- Webhooks validam assinatura (HMAC) antes de processar e são idempotentes.
- Arquivos privados (bucket `store-images`) usam URLs assinadas.
- Auditoria em `audit_logs` para ações críticas (equipe, planos, lojas, privacidade, suporte).
- Acesso de suporte (impersonation) é apenas registro auditado, temporário e com
  referência de consentimento — visível também para a loja.
- LGPD: exportação e exclusão de dados em **Painel → Privacidade**, com política de retenção
  publicada e banner de consentimento de cookies.

## Integrações

| Área | Provedores previstos | Sem credencial |
| --- | --- | --- |
| Pagamento | Pix direto, Mercado Pago, Stripe | Pix pela chave da loja e registro manual |
| Mapas/rotas | Google Maps, Mapbox | etapas registradas pelo entregador |
| Fiscal | Focus NFe, NFe.io, eNotas | cupom não fiscal |
| E-mail | Resend, SendGrid, SES | mensagens simuladas na central |
| Atendimento | WhatsApp Business Cloud API, Telegram | modo demonstração |
| Analytics | GA4, Meta Pixel, Plausible | relatórios internos |
| Impressão | navegador, ponte ESC/POS | impressão pelo navegador |

## Testes

`bun run test` cobre as regras de negócio: criação de loja (slug), catálogo e importação
CSV, carrinho/checkout, taxa de entrega por região, cupom, transições de pedido, Pix
(BR Code + CRC), agenda, permissões de equipe, limites de plano e sanitização.

## Publicação

1. `bun run build` (o Lovable executa automaticamente).
2. Publicar pelo botão **Publish**.
3. Configurar domínio próprio, se houver.
4. Apontar webhooks externos para
   `https://project--<id>.lovable.app/api/public/pagamentos/<provider>` e
   `https://project--<id>.lovable.app/api/public/canais/<canal>/<storeId>`.

## Integrações, API pública e aplicativo instalável

A central de integrações (painel > Integrações e API) conecta WhatsApp Cloud API, Mercado Pago, PagBank, Asaas, marketplaces, Hotmart, mapas, emissão fiscal, e-mail, push e analytics, com credenciais protegidas, teste de conexão, status, último evento, logs, webhooks assinados, idempotência e fila de retentativas.

A API REST v1 (`/api/public/v1`, alias `/api/v1`) usa chaves rotacionáveis com escopos, limite por minuto, paginação, filtros e logs, e publica a documentação em `/api/public/v1/openapi.json`.

Detalhes de uso, assinatura de webhooks e configuração nativa do aplicativo: [docs/aplicativo-e-api.md](docs/aplicativo-e-api.md).
