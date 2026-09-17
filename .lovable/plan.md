# Central de notificações push para clientes

## Objetivo
Criar uma nova página em **Painel › Notificações push** para o lojista enviar mensagens aos clientes que instalaram o app da loja, entraram na conta e aceitaram receber notificações.

A primeira versão terá somente **título e texto**, conforme definido. Ao tocar na notificação, o cliente será levado à loja correspondente.

## Experiência do lojista

### Nova página `/painel/notificacoes`
- Resumo com aparelhos inscritos, campanhas agendadas, envios realizados e falhas recentes.
- Lista de campanhas com estados: rascunho, agendada, enviando, enviada, pausada e cancelada.
- Editor simples com:
  - nome interno da campanha;
  - título e mensagem com limites e contadores;
  - escolha do público;
  - forma e horário de envio;
  - prévia visual da notificação;
  - confirmação antes de disparos imediatos.
- Ações para salvar rascunho, enviar agora, agendar, pausar/retomar recorrência, cancelar e duplicar campanha.
- Envio de teste apenas para um aparelho do próprio lojista.
- Histórico com quantidade enviada, falhas e aparelhos expirados removidos.

### Públicos disponíveis
- Todos os clientes inscritos e com consentimento ativo.
- Clientes novos.
- Clientes ativos.
- Clientes recorrentes.
- Clientes inativos, com quantidade de dias configurável.
- Aniversariantes.
- Carrinho abandonado.
- Pós-compra.

Não haverá seleção manual de clientes nesta etapa.

### Formas de envio
- Imediato.
- Uma única data e hora futura.
- Recorrente por dias da semana, horário e período opcional.
- Automático por evento: aniversário, inatividade, carrinho abandonado e pós-compra.
- Todos os horários usarão o fuso configurado na loja.
- Frequência mínima e janela de silêncio impedirão excesso de mensagens para o mesmo cliente.

## Experiência do cliente
- Após entrar no app instalado da loja, mostrar um convite discreto para ativar notificações.
- Adicionar controle permanente em **Minha conta › Meus dados** para ativar ou desativar notificações por loja.
- Solicitar a permissão do celular somente após toque do cliente.
- Quando aberto dentro da prévia incorporada, orientar a abrir em uma nova aba ou usar o app publicado.
- Registrar separadamente o consentimento de push; desativar remove apenas a inscrição daquela loja no aparelho.
- Não enviar campanhas a clientes sem consentimento de marketing ou de push.

## Dados e segurança
- Criar uma tabela de campanhas push com loja, conteúdo, público, programação, recorrência, situação, autoria e totais.
- Criar uma tabela de entregas para registrar cada tentativa, resultado, cliente/aparelho e chave de deduplicação.
- Ajustar as inscrições push para permitir que o mesmo aparelho acompanhe mais de uma loja sem sobrescrever vínculos anteriores.
- Adicionar consentimento explícito por cliente e loja, com data de aceite e revogação.
- Aplicar permissões para que somente proprietários e equipe autorizada em marketing gerenciem campanhas da própria loja.
- Manter inscrições e resultados invisíveis para outras lojas; dados técnicos dos aparelhos não serão exibidos no painel.
- Validar títulos, mensagens, datas, recorrência e limites no servidor.
- Registrar criação, edição, disparo, pausa e cancelamento na auditoria da plataforma.

## Entrega e automações
- Reaproveitar o envio Web Push/VAPID e o worker de mensagens existentes, sem adicionar cache offline.
- Criar funções protegidas para listar, criar, editar, enviar, pausar e cancelar campanhas.
- Ampliar o envio para lotes controlados, remover inscrições expiradas e persistir resultados.
- Estender a rotina protegida de notificações para processar campanhas vencidas e eventos automáticos de forma idempotente.
- Configurar execução periódica para que os agendamentos sejam enviados sem o painel aberto.
- Evitar duplicidade quando duas execuções ocorrerem ao mesmo tempo.
- Manter a nova página disponível nos planos atuais e incluí-la na seleção de módulos para planos futuros.

## Validação
- Testes de regras de público, consentimento, fuso horário, recorrência, janela de silêncio e deduplicação.
- Testes de isolamento entre lojas e bloqueio de equipe sem permissão.
- Testes de envio imediato, agendado, automático, falha parcial e remoção de aparelho expirado.
- Verificação em celular da ativação após login, controle em Minha conta, recebimento em segundo plano e abertura da loja correta.
- Verificação do painel em telas pequenas e grandes, sem alterar a navegação existente além da nova opção.

## Observações técnicas
- A base atual já possui Web Push com VAPID, worker de mensagens, inscrições por aparelho e rotina protegida de entrega; esses recursos serão ampliados.
- Hoje o cliente ainda não possui um ponto de ativação push, e a entrega existente é direcionada ao lojista. A implementação fechará esse fluxo antes de liberar campanhas.
- O Firebase não é necessário para esta etapa, pois a infraestrutura Web Push existente atende aos PWAs instalados.
