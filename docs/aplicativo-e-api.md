# Aplicativo do cliente e API pública

## 1. Aplicativo instalável (PWA)

O aplicativo do cliente é a própria loja pública, instalável no celular:

- Manifesto em `public/manifest.webmanifest` (nome, ícones, cor, atalhos).
- Ícones em `public/app-icon-192.png`, `app-icon-512.png`,
  `app-icon-maskable-512.png` e `apple-touch-icon.png`.
- Metadados no `head` do app (`src/routes/__root.tsx`).
- Convite de instalação em `src/components/store/InstallAppBanner.tsx`
  (Android/Chrome usa `beforeinstallprompt`; iOS recebe instruções de
  "Adicionar à Tela de Início").

O que o cliente tem no app: catálogo com busca e filtros, carrinho por loja,
pedidos recentes com repetição em um toque, acompanhamento do pedido em tempo
real, saldo e extrato de fidelidade, e avisos na central de notificações.

### Atalhos e links diretos

O escopo do app é `/`, então qualquer link da plataforma abre dentro dele:

| Link | Abre |
| --- | --- |
| `/{loja}` | catálogo da loja |
| `/{loja}/checkout` | carrinho e finalização |
| `/{loja}/acompanhar` | acompanhamento do pedido |
| `/acompanhar?codigo=XYZ` | rastreio por código |
| `/mesa/{token}` | cardápio da mesa (QR Code) |

Os atalhos de tela inicial (pressionar e segurar o ícone) estão declarados em
`shortcuts` no manifesto.

## 2. Configuração nativa (documentada, não publicada)

Nada aqui é executado pela plataforma — são os passos para quem quiser
empacotar o app para a Play Store depois:

1. **TWA / Bubblewrap**: `npx @bubblewrap/cli init --manifest
   https://SEU-DOMINIO/manifest.webmanifest`, depois `bubblewrap build`.
2. **Digital Asset Links**: publique
   `https://SEU-DOMINIO/.well-known/assetlinks.json` com o SHA-256 do
   certificado de assinatura para abrir os links sem barra de navegador.
3. **Deep links nativos**: no `AndroidManifest.xml`, declare
   `<intent-filter android:autoVerify="true">` com `android:scheme="https"` e
   `android:host="SEU-DOMINIO"`.
4. **Push nativo**: crie o projeto no Firebase Cloud Messaging e cadastre a
   chave do servidor no conector "Notificações push" da central de
   integrações. O envio pela web exige um service worker de mensageria
   (`firebase-messaging-sw.js`), adicionado apenas quando o push for ativado.
5. **iOS**: a Apple aceita PWA pela tela de início; para App Store é
   necessário um invólucro nativo próprio.

## 3. API REST v1

- Base pública: `https://SEU-DOMINIO/api/public/v1`
- Alias interno: `https://SEU-DOMINIO/api/v1`
- Documentação OpenAPI 3.1: `GET /api/public/v1/openapi.json`

### Autenticação

```bash
curl https://SEU-DOMINIO/api/public/v1/pedidos?status=preparing&page=1&per_page=25 \
  -H "Authorization: Bearer sp_live_..."
```

Chaves são criadas no painel em **Integrações e API**. Cada chave tem escopos,
limite por minuto, validade opcional e pode ser rotacionada (a anterior é
revogada na hora). O valor completo aparece apenas na criação — guardamos só o
hash.

### Recursos

`lojas`, `catalogo/produtos`, `catalogo/categorias`, `clientes`, `pedidos`,
`pagamentos`, `entregas`, `mesas`, `estoque`, `estoque/movimentos`, `cupons`,
`webhooks`.

Listagens aceitam `page`, `per_page` (máx. 100), `since`, `until` e filtros por
recurso (`status`, `type`, `category_id`, `q`...). A resposta é sempre
`{ "data": [...], "meta": { page, per_page, total, total_pages } }`.

Erros seguem `{ "error": { "code": "...", "message": "..." } }` com 401 (chave
inválida), 403 (escopo insuficiente), 404, 405, 429 (limite) e 500.

### Webhooks de saída

Cadastre endpoints no painel ou via `POST /v1/webhooks`. Cada entrega leva:

```
x-seupedido-event: pedido.status
x-seupedido-delivery: <uuid>
x-seupedido-timestamp: <unix>
x-seupedido-signature: t=<unix>,v1=<HMAC-SHA256>
```

A assinatura é o HMAC-SHA256 de `` `${timestamp}.${corpo}` `` usando o segredo do
endpoint (devolvido só na criação). Rejeite entregas com mais de 5 minutos.
Falhas entram em fila com recuo exponencial (30s, 2min, 10min, 1h, 6h).

## 4. Webhooks de entrada dos conectores

Endereço: `https://SEU-DOMINIO/api/public/integracoes/{conector}/{idDaLoja}`

- A assinatura do provedor é conferida antes de qualquer leitura de dados.
- Cada evento é gravado com chave única (`conector` + id externo): repetições
  são descartadas com 200.
- Falha de processamento não perde o evento — ele fica em `retrying`.

Para processar a fila periodicamente, chame com o segredo de cron:

```bash
curl -X POST https://SEU-DOMINIO/api/public/integracoes/retentativas \
  -H "Authorization: Bearer $LOVABLE_CRON_SECRET"
```
