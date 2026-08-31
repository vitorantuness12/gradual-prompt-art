# Migração para o novo Supabase (projeto `dzqhxycpglwgfdapuvis`)

Este documento explica, em linguagem simples, como apontar o "O Seu Pedido" para o novo
projeto Supabase. **Nada foi apagado**: todas as telas, rotas, migrations e integrações
existentes continuam no lugar.

## 1. Variáveis de ambiente necessárias

Públicas (podem ir para o navegador):

| Variável | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://dzqhxycpglwgfdapuvis.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publicável (`sb_publishable_...`) do novo projeto |
| `NEXT_PUBLIC_SUPABASE_URL` | mesmo valor da URL (compatibilidade) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | mesma chave publicável (compatibilidade) |
| `PUBLIC_SITE_URL` | `https://oseupedido.com.br` |

Somente no servidor/hosting (**nunca no frontend, nunca no Git**):

`SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS`,
`EVOLUTION_API_URL`, `EVOLUTION_API_GLOBAL_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`,
`MERCADO_PAGO_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `OPENAI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

O modelo está em `.env.example` (sem segredos). O `.env` real está ignorado pelo Git
(`.gitignore` cobre `.env` e `.env.*`, permitindo `.env.example`).

O cliente Supabase (`src/integrations/supabase/client.ts`) agora aceita, nesta ordem:
`VITE_SUPABASE_URL` → `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL` (o mesmo para a chave).

## 2. Como rodar as migrations no novo projeto

As migrations estão em `supabase/migrations`, em ordem cronológica pelo nome do arquivo:

```
20260828182053_...sql
20260828195143_...sql
20260830002206_...sql
20260830190704_...sql
20260830192318_...sql
20260830193425_...sql
20260830194525_...sql
20260830194658_...sql
20260830195147_...sql
```

Opção A — SQL Editor: abra o SQL Editor do novo projeto e cole o conteúdo de cada arquivo,
**um por vez, na ordem de cima para baixo**, executando e conferindo o resultado antes de ir
para o próximo.

Opção B — CLI: `supabase link --project-ref dzqhxycpglwgfdapuvis` e depois `supabase db push`.

Atenção: este repositório contém apenas as migrations criadas depois do histórico inicial do
banco antigo. Se ao rodar aparecer erro de tabela/tipo inexistente (`relation ... does not
exist`), significa que o esquema base ainda não existe no projeto novo — nesse caso é
necessário exportar o schema completo do banco atual (`supabase db dump --schema public`) e
executar esse dump antes das migrations acima. Nenhum dado de produção precisa ser copiado.

## 3. Como testar cadastro e login

1. Em Authentication → URL Configuration, defina Site URL `https://oseupedido.com.br` e
   adicione as URLs de redirecionamento usadas (domínio + `/auth`, `/auth/callback`).
2. Se for usar Google, habilite o provedor Google em Authentication → Providers.
3. Abra `/auth`, crie uma conta com e-mail e senha e confirme o e-mail.
4. Faça login e verifique se `profiles` recebeu a linha nova (trigger `handle_new_user`).
5. Crie uma loja em `/onboarding` e confirme que `store_members` recebeu o registro `owner`.
6. Para virar superadmin, insira manualmente a linha em `user_roles` com `role = 'super_admin'`.

## 4. O que ainda depende do Lovable Cloud (fase 1 — pode continuar)

| Área | Arquivos | Situação |
| --- | --- | --- |
| Envio de e-mail | `src/lib/email-templates/send-email.ts`, `src/lib/assinaturas-email.server.ts`, `src/lib/cliente.server.ts`, `src/routes/lovable/email/**` | Usa `LOVABLE_API_KEY` / `LOVABLE_SEND_URL`. Continua funcionando enquanto o app roda no hosting da Lovable. |
| Cron jobs | `src/integrations/supabase/cron-auth.ts` + rotas `src/routes/api/public/**` (lembretes de carrinho, agenda, assinaturas, cashback, retentativas) | Autenticados por `LOVABLE_CRON_SECRET`. As chamadas agendadas no banco apontam para URLs `*.lovable.app` (ver migrations `20260830192318` e `20260830195147`). |
| Sessão no preview | `src/integrations/supabase/previewAuthStorage.ts` | Só afeta o editor/preview; inofensivo em produção. |
| Documentação | `docs/aplicativo-e-api.md` | Menciona URLs `lovable.app`; apenas texto. |

Remover isso agora quebraria e-mails transacionais e todas as rotinas automáticas — por isso
foi preservado.

## 5. Etapas para sair completamente do Lovable Cloud

1. **E-mail**: trocar `sendTemplateEmail` por um provedor próprio (Resend/SES) usando
   `RESEND_API_KEY`, e reconfigurar o webhook de e-mails de autenticação no novo projeto.
2. **Cron**: recriar os agendamentos (`pg_cron` + `pg_net`) no novo banco apontando para o
   domínio final `https://oseupedido.com.br/api/public/...`, mantendo o segredo em uma
   variável própria (ex.: `CRON_SECRET`) e atualizando `cron-auth.ts`.
3. **Hosting**: publicar o app em um host próprio (Cloudflare Workers/Vercel) com todas as
   variáveis do item 1 configuradas lá.
4. **Storage**: criar os buckets de imagens no projeto novo e ajustar as políticas.
5. **Chaves**: gerar novamente VAPID, tokens de pagamento e Evolution API no ambiente novo.
6. **Domínio**: apontar `oseupedido.com.br` para o novo hosting e revalidar OAuth/redirects.

Nenhuma etapa acima altera dados: o projeto novo está vazio e não há importação a fazer.
