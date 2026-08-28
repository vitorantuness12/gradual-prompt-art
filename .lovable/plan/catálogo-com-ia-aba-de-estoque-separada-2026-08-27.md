# Catálogo com IA + aba de Estoque separada

## 1. Criar catálogo por foto (IA)
Nova aba **Criar com IA** dentro do Catálogo.

- O lojista tira/envia uma ou mais fotos (cardápio impresso, tabela de preços, prateleira, foto do produto).
- A imagem vai para a IA (Lovable AI, sem chave extra) que devolve uma lista estruturada: nome, descrição, categoria, tipo, preço, preço promocional, unidade, tags.
- Tela de revisão: tabela editável com todos os itens detectados, checkbox para incluir/excluir, edição inline de nome/preço/categoria antes de salvar.
- Ao confirmar, os itens são criados no catálogo e categorias novas são criadas automaticamente (mesma regra do CSV atual).

## 2. Criar catálogo a partir de texto
Na mesma aba, um campo de texto livre onde o lojista cola o cardápio/lista (ex.: "Pizza calabresa 54,90 / Coca 2L 12").

- A IA converte o texto na mesma lista estruturada e cai na mesma tela de revisão.
- Funciona também colando texto de WhatsApp ou de PDF copiado.

## 3. Separar Estoque do Catálogo
Nova página **Estoque** no menu lateral (Catálogo fica só com itens/categorias/preços/montador/agenda/IA/CSV).

A página de Estoque terá:
- **Visão geral**: total de itens controlados, itens em ruptura, itens abaixo do mínimo, valor total em estoque (custo × quantidade).
- **Lista de produtos com estoque**: busca, filtro (todos / abaixo do mínimo / sem estoque / sem controle), edição rápida de quantidade e mínimo, ativar/desativar controle de estoque.
- **Ajuste de estoque**: entrada, saída, perda/quebra e balanço (contagem), com motivo — cada ajuste grava movimentação.
- **Ingredientes / ficha técnica**: gestão dos insumos (nome, unidade, estoque, mínimo, custo) que já alimentam a baixa automática.
- **Histórico de movimentações**: origem (pedido, PDV, ajuste manual), quantidade, data e responsável, com exportação CSV.
- Alerta de ruptura já existente passa a viver nesta página (mantido também no topo do catálogo como aviso curto).

## Detalhes técnicos
- Server function `src/lib/catalogo-ia.functions.ts` chamando `https://ai.gateway.lovable.dev/v1/chat/completions` com `google/gemini-2.5-flash` (visão) e saída JSON validada por Zod; tratamento de 429/402.
- Reaproveita `CsvProductInput` de `src/lib/catalog.ts` como formato comum entre IA, texto e CSV, e extrai a rotina de inserção (criar categorias faltantes + inserir produtos) para uma função compartilhada.
- Novos componentes: `src/components/catalogo/AiCatalogTab.tsx` e `src/components/catalogo/AiCatalogReview.tsx`.
- Nova rota `src/routes/_authenticated/painel.estoque.tsx` + `src/lib/estoque.ts` (consultas, ajustes, valor de estoque) usando as tabelas `products`, `ingredients` e `inventory_movements` existentes.
- Sem mudança de schema prevista; se faltar coluna de custo em `ingredients`, adiciono via migração.
