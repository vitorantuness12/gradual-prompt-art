# Correção definitiva da identidade dos PWAs das lojas

## Diagnóstico confirmado

- A loja `lanchesdoantunes` possui ícone normal e adaptável publicados no banco.
- O manifesto atual dessa loja já retorna os dois ícones próprios em 512×512.
- Porém, o HTML inicial de todas as páginas ainda inclui globalmente o `apple-touch-icon`, favicon, nome do aplicativo e cor da plataforma. Esses valores só são trocados depois que a página abre e executa código no navegador.
- Essa troca tardia cria uma disputa: o sistema operacional pode capturar a identidade Pedi Um antes de receber a identidade da loja, sobretudo no iPhone e durante a instalação.
- As imagens das lojas são URLs assinadas externas. Vamos evitar que a instalação dependa diretamente dessas URLs e do momento em que o navegador atualiza o cabeçalho.

## Implementação

### 1. Criar uma fonte única de identidade por loja

- Centralizar a resolução de nome, cor, ícone normal e ícone adaptável.
- Manter a prioridade: ícone do aplicativo → logo da loja → ícone neutro de loja.
- Nunca usar a logo da plataforma como fallback de uma loja.
- Reutilizar exatamente a mesma resolução no manifesto, no cabeçalho e na instalação.

### 2. Servir os ícones por URLs estáveis da própria loja

- Criar endpoints públicos próprios para o ícone normal e o adaptável, identificados pelo slug.
- Esses endpoints resolverão internamente a imagem publicada da loja e usarão o fallback neutro quando necessário.
- Manifesto e cabeçalho usarão essas URLs estáveis, evitando expor URLs assinadas e reduzindo diferenças entre Android e iPhone.
- Loja inexistente, inativa ou não publicada não receberá identidade instalável.

### 3. Corrigir o HTML inicial de todas as páginas da loja

- Adicionar no cabeçalho de catálogo, carrinho, checkout, agendamento, retirada, acompanhamento e área de membros:
  - ícone Apple específico da loja;
  - favicon específico da loja;
  - nome do aplicativo da loja;
  - cor principal da loja;
  - manifesto específico da loja.
- Remover a dependência da substituição tardia por JavaScript nessas páginas.
- Garantir que exista apenas um manifesto e uma identidade de instalação válidos por página.

### 4. Tornar o upload e a publicação consistentes

- Continuar ajustando o ícone normal para 512×512 e compactando a imagem.
- Aumentar a margem segura do ícone adaptável para evitar cortes em aparelhos Android.
- Após publicar a personalização, invalidar as consultas da loja e mostrar claramente que a identidade publicada é a usada no aplicativo.
- Preservar o fluxo de rascunho: imagens não publicadas não substituirão silenciosamente o app atual.

### 5. Evitar instalação com identidade incorreta

- O botão de instalar só ficará disponível depois que a página confirmar o manifesto da loja atual.
- Se a identidade da loja não puder ser carregada, o convite de instalação não aparecerá em vez de instalar o app da plataforma.
- Manter a tela de abertura exclusiva do aplicativo de lojista; aplicativos das lojas continuarão sem essa apresentação.

## Validação

- Testes automatizados para prioridade dos ícones, fallback neutro, loja inexistente e separação entre loja e painel.
- Conferência do HTML antes da execução de JavaScript, garantindo que não contenha logo Pedi Um nas páginas das lojas.
- Conferência dos manifestos e endpoints de imagem de todas as lojas publicadas.
- Teste de instalação Android/Chrome e simulação do fluxo “Adicionar à Tela de Início” do iPhone.
- Verificação de catálogo, carrinho, checkout e acompanhamento após navegação direta e navegação interna.

## Resultado esperado

Cada loja instalada terá somente seu nome, cor e logo publicados em “Personalizar loja”. A identidade Pedi Um permanecerá exclusiva do aplicativo da plataforma para lojistas. Aplicativos instalados anteriormente ainda precisarão ser removidos e instalados novamente, pois Android e iPhone preservam o ícone escolhido no momento da instalação.
