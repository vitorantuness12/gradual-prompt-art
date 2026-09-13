# Agendamentos e Encomendas por ramo

## Objetivo
Separar claramente a gestão de horários da gestão de pedidos antecipados, adaptando textos e ações para restaurantes, pet shops, mercados e farmácias. As encomendas poderão nascer na loja online ou ser cadastradas pela equipe no painel.

## Agendamentos
- Reformular `/painel/agendamentos` para apresentar o uso adequado ao ramo:
  - restaurantes: reservas de mesa e retiradas programadas;
  - pet shops: banho, tosa, consultas e outros serviços;
  - mercados e farmácias: retirada ou entrega com horário marcado.
- Priorizar a agenda do dia, próximos horários, cliente, telefone, tipo e situação.
- Manter bloqueios, lista de espera, lembretes e configurações; recursos específicos de serviços, como comissão e ficha, ficam disponíveis sem dominar a tela.
- Remover desta página a fila de encomendas e controles de produção, evitando mistura entre as duas operações.

## Encomendas
- Reformular `/painel/encomendas` para pedidos antecipados dos quatro ramos: eventos e grandes pedidos, kits/cestas, itens sob encomenda e compras programadas.
- Manter cadastro manual pela equipe, orçamento/link para aprovação, sinal, produção, capacidade, histórico e regras.
- Trazer a fila de capacidade para esta página e identificar com clareza encomendas recebidas pela loja online versus cadastradas no painel.
- Liberar “Encomendas” no menu padrão dos segmentos de alimentação, varejo e conveniência.

## Avisos ao lojista
- Ampliar o aviso em tempo real do painel para distinguir pedido comum, nova encomenda e novo agendamento.
- Exibir aviso na tela, tocar som quando habilitado e usar notificação do aparelho quando o painel estiver em segundo plano.
- Atualizar automaticamente as listas e o sino de notificações ao receber cada evento.
- Registrar uma notificação na central quando um agendamento público for concluído e quando uma encomenda for criada/convertida.

## Detalhes técnicos
- Reaproveitar as tabelas e fluxos atuais (`appointments`, `orders`, `quotes`, `production_queue` e `notifications`), sem migração estrutural.
- Usar os canais em tempo real existentes do Supabase com limpeza correta das inscrições.
- Preservar os links públicos de confirmação, orçamento e acompanhamento já existentes.
- Atualizar os metadados exclusivos das duas páginas e validar desktop, celular, criação manual, mudança de situação e alertas.
