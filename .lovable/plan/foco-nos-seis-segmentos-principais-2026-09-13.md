# Foco nos seis segmentos principais

## Objetivo
Concentrar a apresentação e a experiência do lojista em restaurantes/delivery, pizzarias/hamburguerias, mercados/mercearias, farmácias/conveniências, pet shops/clínicas veterinárias e cafeterias/padarias.

## Alterações
- Reduzir a seção de segmentos da página inicial aos seis negócios do anexo, mantendo os textos e ícones correspondentes.
- Remover do painel o cartão e a janela “Configurar funções do meu negócio”. O menu deixa de depender dessa escolha manual e continua respeitando os módulos contratados no plano.
- Manter a Agenda disponível para operações de delivery, inclusive nos atalhos e no resumo do painel quando aplicável.
- Retirar o checkout digital da decisão de checkout, dos links públicos e das opções de administração. Lojas antigas configuradas como digitais terão retorno seguro para o checkout normal de loja, evitando página quebrada.
- Remover menções de entrada para cursos/produtos digitais e área de membros onde elas promovem esse fluxo, sem apagar históricos de pedidos ou dados já existentes.

## Detalhes técnicos
- Simplificar os grupos de segmentos e os padrões automáticos para alimentação e conveniência, cobrindo os seis casos escolhidos.
- Remover a filtragem do menu por `store_features`; manter somente a liberação por plano.
- Remover a rota dedicada de checkout digital e atualizar todos os resolvedores de URL que ainda apontam para ela.
- Preservar o checkout de agendamento no código para a função Agenda, mas não como segmento principal separado.
- Validar página inicial, carrinho, loja pública, painel e Agenda em telas móvel e desktop.
