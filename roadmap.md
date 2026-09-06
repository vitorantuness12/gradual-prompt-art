# Roteiro — novos módulos

Ordem combinada com o usuário: um bloco por vez.

1. [ ] Central de marketing automática — cupom de aniversário, "sentimos sua falta" em 30 dias, pós-compra pedindo avaliação (WhatsApp já ligado)
2. [ ] Upsell inteligente por IA no catálogo + reordenação automática pelos itens que mais vendem
3. [ ] App do lojista (PWA) instalável com alerta sonoro de pedido novo
4. [ ] Painel de metas e comparativo por período + resumo diário no WhatsApp do dono
5. [ ] Cobrança recorrente da plataforma com bloqueio automático por inadimplência e teste grátis
6. [ ] Gestão de múltiplas unidades (marca com várias lojas, estoque e relatório consolidado)

## Já pronto (base)
- Motor de automações (`src/lib/automacoes.server.ts`) e cron `/api/public/crm/automacoes`
- Cobrança de planos manual no admin (`src/lib/planos-cobranca.functions.ts`)
- Notas fiscais, estornos, LGPD, afiliados
