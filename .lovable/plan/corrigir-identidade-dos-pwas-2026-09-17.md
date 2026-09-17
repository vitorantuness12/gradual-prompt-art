# Corrigir identidade dos PWAs

## Objetivo
Separar completamente a experiência instalada da plataforma e das lojas.

## Alterações
- Fazer o manifesto de cada loja usar a logo principal configurada em **Personalizar loja** como primeira opção de ícone.
- Manter os ícones específicos de PWA apenas como alternativa e nunca usar a marca da plataforma dentro do app da loja.
- Exibir a tela animada de abertura somente no PWA do lojista.
- Não renderizar a tela de abertura em catálogos, carrinho, checkout, acompanhamento ou conta do cliente, inclusive quando instalados.
- Preservar o manifesto e a tela de abertura atuais no app da plataforma para lojistas.

## Validação
- Conferir o manifesto de uma loja com e sem logo configurada.
- Abrir o catálogo normal e instalado para confirmar ausência da tela de apresentação.
- Abrir o PWA do lojista para confirmar que a tela de apresentação continua aparecendo.
- Verificar desktop e mobile sem alterar layout ou funcionalidades.

## Detalhes técnicos
- A separação será baseada na origem explícita do app do lojista (`origem=app` no fluxo de autenticação/painel), sem inferir pelo primeiro trecho genérico da URL.
- Para uma loja sem logo, será usado um ícone neutro de fallback da própria vitrine, não o ícone institucional do Pedi Um.
