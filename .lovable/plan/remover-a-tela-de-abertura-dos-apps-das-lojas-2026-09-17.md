# Remover a tela de abertura dos apps das lojas

## Objetivo
Garantir que o aplicativo instalado de cada loja abra diretamente no catálogo, sem renderizar a tela de apresentação da plataforma.

## Implementação
1. Retirar a tela de abertura do ponto global compartilhado por todas as páginas.
2. Montar essa tela somente nas páginas de entrada do aplicativo do lojista: login do lojista e painel.
3. Manter o endereço inicial de cada app de loja apontando diretamente para `/{loja}`, preservando nome, ícone e escopo próprios.
4. Confirmar que catálogo, carrinho, checkout, acompanhamento e área de membros nunca carregam a apresentação da plataforma.

## Validação
- Abrir os três catálogos publicados em modo de aplicativo e confirmar que o catálogo é o primeiro conteúdo exibido.
- Confirmar que o aplicativo da plataforma ainda mostra sua apresentação antes do login do lojista.
- Verificar erros no navegador e executar os testes relacionados ao PWA.

## Observação
A tela nativa momentânea criada pelo próprio iOS ou Android durante a inicialização não é uma página do sistema e não pode ser eliminada; ela usará a identidade visual própria da loja. A apresentação animada do Pedi Um será removida completamente dos apps das lojas.
