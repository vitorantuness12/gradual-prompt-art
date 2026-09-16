# Atualização textual da página inicial para Pedi Um

## Objetivo
Atualizar a comunicação pública da página inicial para **Pedi Um | Loja, Pedidos e Gestão**, usando o slogan **“Tudo pra vender. Tudo em um.”**, sem modificar layout, componentes, grids, espaçamentos, animações, responsividade ou regras de negócio.

## Alterações planejadas

### 1. Navegação e primeira dobra
- Adaptar apenas os rótulos dos itens já existentes no menu para a nomenclatura solicitada, mantendo as mesmas âncoras e ações.
- Atualizar título, apoio e botões da primeira dobra para a nova proposta da Pedi Um.
- Manter os destaques de **0% de comissão** e **7 dias grátis**, pois ambos já aparecem como condições vigentes na página atual.
- Preservar imagem, animações, cartões flutuantes, composição e dimensões atuais.

### 2. Seções existentes
- Reescrever os textos das seções atuais, sem criar ou remover seções e sem mudar a quantidade de cartões:
  - endereço e identidade da loja;
  - segmentos e “Para quem é”;
  - posicionamento e venda direta;
  - como funciona;
  - recursos;
  - integrações reais;
  - manifesto/proposta;
  - planos;
  - dúvidas frequentes;
  - chamada final;
  - rodapé.
- Distribuir os conceitos de loja, pedidos, PDV, estoque, pagamentos, entregas, clientes e gestão dentro dos componentes existentes.
- Retirar da comunicação principal referências a agenda, agendamento, consultas, horários e prestadores, sem apagar ou alterar essas funcionalidades internas.
- Remover referências textuais restantes à marca antiga, mantendo intactos e-mails, redes sociais, URLs canônicas, endpoints e identificadores técnicos ainda ativos.

### 3. Planos e informações comerciais
- Preservar preços, limites, módulos e dados carregados do painel administrativo.
- Ajustar apenas o texto institucional da seção e os textos de contingência exibidos quando não houver planos publicados.
- Não inventar integrações, condições comerciais ou funcionalidades.

### 4. SEO, compartilhamento e PWA
- Aplicar na página inicial o título e a descrição solicitados.
- Atualizar `og:title`, `og:description`, `twitter:title` e `twitter:description`.
- Manter canonical e `og:url` no domínio técnico vigente `https://oseupedido.com.br`, conforme a configuração atual do projeto.
- Atualizar os padrões globais de marca, `site_name`, `application-name` e descrição do PWA para Pedi Um.
- Reutilizar a capa configurável já existente como imagem de compartilhamento; não gerar nem trocar o design da imagem sem um arquivo 1200×630 aprovado.
- Atualizar textos alternativos públicos que ainda mencionem a marca antiga.

### 5. Validação
- Buscar globalmente as variações públicas de “O Seu Pedido”, grafias incorretas de Pedi Um e menções de agendamento no marketing da página inicial.
- Verificar links e âncoras existentes, sem criar links para páginas inexistentes.
- Conferir a página em desktop, tablet e celular, observando quebras de título, overflow e posição dos componentes.
- Confirmar metadata, manifesto, console do navegador e funcionamento dos botões e formulários afetados.
- Executar verificações focadas de código e formatação.

## Arquivos previstos
- `src/routes/index.tsx`
- `src/routes/__root.tsx`
- `src/routes/api/public/manifest.ts`
- Componentes atuais em `src/components/landing2/` usados pela página inicial
- Nenhum banco de dados, regra comercial ou funcionalidade interna será alterado.

## Observação técnica
Os exemplos visíveis `pedium.com.br/...` serão preservados porque já fazem parte da página atual e foram solicitados anteriormente. Já os endereços técnicos ativos em `oseupedido.com.br` não serão substituídos sem a conexão definitiva do novo domínio, evitando links, SEO e integrações quebrados.
