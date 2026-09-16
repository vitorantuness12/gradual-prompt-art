# Identidade visual da plataforma no Super Admin

## Objetivo
Adicionar ao `/admin` uma área de **Identidade visual** para o super administrador controlar, separadamente, as logos exibidas na página de vendas e na área do lojista, com versões próprias para os modos claro e escuro.

## O que será criado

- Nova aba **Identidade visual** no Super Admin.
- Quatro logos independentes:
  - página de vendas — modo claro;
  - página de vendas — modo escuro;
  - área do lojista — modo claro;
  - área do lojista — modo escuro.
- Upload de PNG, JPG, WebP ou SVG, com validação de tamanho e prévia antes de salvar.
- Visualização lado a lado sobre fundos claro e escuro, simulando o cabeçalho onde cada logo será usada.
- Ações para trocar, remover e restaurar a logo padrão Pedi Um em cada posição.
- Indicador de alterações não salvas, botão de salvar e mensagens claras de sucesso ou falha.
- Regras de fallback: se uma versão não estiver cadastrada, usar a versão do outro tema; se nenhuma estiver cadastrada, usar a logo padrão atual.

## Aplicação das logos

- **Página de vendas:** cabeçalho e rodapé da página inicial.
- **Área do lojista:** cabeçalho do painel e demais telas internas que usam a marca da plataforma.
- Login, cadastro e páginas institucionais continuarão usando a identidade geral da plataforma, com fallback seguro para a logo padrão.
- As logos próprias das lojas nos catálogos públicos não serão alteradas.

## Segurança e armazenamento

- Criar uma configuração global única de identidade visual no banco.
- Leitura pública apenas dos endereços das imagens necessários para renderizar a marca.
- Alteração permitida somente a usuários com papel `super_admin`, validado no servidor.
- Armazenar os arquivos em uma pasta pública exclusiva da identidade da plataforma.
- Registrar cada alteração no histórico administrativo.

## Detalhes técnicos

- Criar tabela global com os quatro endereços de logo, datas e usuário da última alteração, incluindo `GRANT`, RLS e políticas na mesma migração.
- Criar funções de leitura e gravação com validação Zod e verificação server-side de `super_admin`.
- Criar um componente central de logo que seleciona automaticamente contexto e tema, evitando lógica duplicada nas páginas.
- Manter a imagem atual empacotada como fallback para carregamento inicial, indisponibilidade de rede ou configuração incompleta.
- Invalidar o cache após salvar para refletir a nova identidade imediatamente.

## Validação

- Testar acesso permitido e bloqueado ao gerenciamento.
- Testar upload, substituição, remoção, restauração e fallback.
- Conferir página inicial, rodapé e painel em modo claro e escuro.
- Verificar desktop e celular, sem deformar ou cortar logos horizontais e verticais.
