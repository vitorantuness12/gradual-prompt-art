# Otimização completa do aplicativo PWA

## Objetivo
Transformar o Pedi Um em uma experiência móvel moderna, rápida e semelhante a um aplicativo nativo, com experiências próprias para o lojista e para o cliente. O aplicativo continuará dependente de internet, sem cache offline de páginas ou operações.

## Experiência do lojista
- Reformular a estrutura móvel do painel com altura dinâmica, áreas seguras para recortes e barra do sistema, e conteúdo sem saltos ao abrir teclado ou mudar a barra do navegador.
- Criar barra inferior fixa com cinco destinos: Início, Pedidos, Financeiro, Clientes e Mais.
- Colocar recursos secundários no menu “Mais”, preservando todas as permissões de plano e segmento já existentes.
- Simplificar o topo móvel para marca, loja ativa e alertas; mover ações menos frequentes para menus apropriados.
- Destacar novos pedidos, pendências financeiras e clientes que exigem atenção com contadores e estados claros.
- Adaptar listas críticas, principalmente Pedidos, Financeiro e Clientes, para cartões móveis legíveis em vez de tabelas horizontais.
- Transformar filtros, detalhes e ações rápidas em painéis inferiores no celular, com botões de toque confortáveis e retorno visual imediato.

## Experiência do cliente
- Criar navegação inferior contextual na loja instalada, priorizando Início, Buscar, Carrinho, Pedidos e Conta.
- Manter catálogo, carrinho, checkout e acompanhamento visualmente contínuos, com cabeçalhos compactos e ações principais acessíveis ao polegar.
- Preservar a identidade visual de cada loja e os fluxos atuais de cupom, pagamento, endereço, identificação por telefone e acompanhamento.
- Aplicar indicadores persistentes no carrinho e nos pedidos sem encobrir conteúdo ou ações.

## Comportamento de aplicativo
- Adicionar suporte completo às áreas seguras de iPhone e Android e usar dimensões móveis estáveis.
- Consolidar a detecção de instalação e modo aplicativo para evitar comportamentos divergentes entre loja e painel.
- Tornar a opção de instalação fácil de encontrar no painel e na loja, sem interromper tarefas importantes.
- Manter a tela de abertura animada atual, reduzindo bloqueios e respeitando preferência por menos movimento.
- Padronizar transições curtas entre telas, estados pressionados, carregamento, vazio e erro.
- Manter notificações push e sons; alinhar ícone e identidade das notificações à configuração visual da plataforma.
- Exibir aviso claro quando a conexão cair e impedir ações dependentes de internet até a reconexão, sem prometer funcionamento offline.

## PWA e instalação
- Manter os manifestos dinâmicos para painel e loja, com nomes, atalhos, ícones comuns e adaptáveis configurados no Super Admin.
- Remover manifestos estáticos antigos que não são utilizados, evitando configurações concorrentes.
- Não adicionar cache de aplicação ou funcionamento offline; o service worker continuará dedicado às notificações.
- Preservar a abertura direta do painel instalado em Pedidos e configurar atalhos coerentes para as rotinas prioritárias.

## Acessibilidade e qualidade
- Garantir alvos de toque de pelo menos 44 px, foco visível, identificação da aba ativa e navegação por teclado/leitor de tela.
- Evitar sobreposição com a barra inferior, teclado, avisos e menus em telas pequenas.
- Respeitar modo claro/escuro, tokens de identidade visual e redução de movimento.
- Validar as principais telas em larguras de celular e desktop, incluindo instalação, modo standalone, alertas e navegação.

## Implementação técnica
- Criar componentes reutilizáveis para barra inferior, cabeçalho móvel, menu “Mais”, estado de conexão e instalação.
- Integrar esses componentes às estruturas existentes do painel e da loja sem duplicar rotas nem regras de autorização.
- Aplicar adaptação móvel primeiro às rotinas prioritárias: Pedidos e alertas, depois Financeiro e Clientes.
- Reutilizar os componentes de diálogo/painel inferior existentes e os padrões atuais de navegação tipada.
- Adicionar testes para destinos da barra inferior, permissões, indicadores, modo standalone, instalação e estado sem conexão.

## Critérios de conclusão
- Painel e loja instalados têm aparência e navegação próprias de aplicativo.
- As cinco ações principais permanecem acessíveis com uma mão no celular.
- Nenhum conteúdo fica atrás de recortes, barra do sistema, teclado ou navegação inferior.
- Pedidos, alertas, financeiro e clientes são utilizáveis sem rolagem horizontal obrigatória.
- Instalação, ícones, tela de abertura e notificações mantêm a identidade configurada.
- O aplicativo informa perda de conexão e volta ao normal automaticamente quando a internet retorna.
