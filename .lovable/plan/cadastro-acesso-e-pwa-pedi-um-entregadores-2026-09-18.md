# Cadastro, acesso e PWA Pedi Um Entregadores

## Objetivo

Substituir a aprovação central por documentos por um fluxo controlado pela loja:

```text
Loja cadastra entregador → sistema envia link seguro → entregador define a senha
→ vínculo com aquela loja é ativado → acesso ao app Pedi Um Entregadores
```

O cadastro público de entregadores será encerrado. Apenas pessoas convidadas por uma loja poderão ativar esse perfil.

## 1. Unificar cadastro e autorização por loja

- Transformar `/painel/entregadores` no local principal para cadastrar e administrar entregadores.
- Formulário da loja: nome, e-mail, telefone, veículo, placa opcional, região, chave Pix e comissão por entrega.
- Ao cadastrar:
  - validar que o usuário atual administra a loja;
  - criar ou localizar a conta sem expor dados de outros usuários;
  - criar o perfil operacional do entregador;
  - criar o vínculo exclusivo com a loja;
  - enviar um link de ativação seguro para o entregador definir a própria senha;
  - impedir duplicidade de vínculo, e-mail ou telefone na mesma loja.
- Contas já existentes receberão um convite para vincular o perfil atual, sem troca forçada de senha.
- A loja poderá aprovar, bloquear, reativar ou remover somente os vínculos da própria equipe.

## 2. Remover análise de documentos

- Retirar upload, lista e textos de análise de documentos do fluxo do entregador.
- Não exigir CNH, identidade, documento do veículo ou comprovante para liberar o acesso.
- Manter somente os dados operacionais escolhidos: nome, telefone, e-mail, veículo, placa opcional, região e Pix.
- Converter a tela de “status do cadastro” em uma tela simples de vínculo com lojas, mostrando quais lojas estão ativas, bloqueadas ou aguardando ativação.
- Preservar dados/documentos históricos no banco, sem exibi-los nem apagá-los automaticamente.

## 3. Tornar a autorização realmente específica por loja

- Parar de usar a aprovação global de `delivery_profiles` como autorização para trabalhar.
- Autorizar entregas somente quando existir vínculo aprovado em `store_couriers` para aquela loja.
- Sincronizar o vínculo operacional usado na atribuição de entregas, eliminando a inconsistência atual entre perfil, vínculo e cadastro interno de entregador.
- Garantir que uma aprovação da Loja A não dê acesso às entregas da Loja B.
- Ajustar seleção, atribuição automática, estado online e consultas para listar apenas entregadores aprovados daquela loja.
- Registrar quem cadastrou/aprovou, quando ativou, bloqueios e remoções para auditoria.

## 4. Link especial de acesso do entregador

- Criar a página pública `/entregadores`, exclusiva para:
  - ativar convite e definir senha;
  - entrar com e-mail/telefone e senha;
  - entrar com código por e-mail;
  - recuperar senha;
  - instalar o aplicativo.
- Não mostrar opção de cadastro livre nessa página.
- Depois do login, validar que a conta possui vínculo de entregador e abrir `/entregador`; contas sem convite válido não entram no ambiente.
- Atualizar os redirecionamentos de contas com múltiplos perfis sem afetar cliente ou lojista.

## 5. Aplicativo PWA “Pedi Um Entregadores”

- Criar manifesto próprio com:
  - nome `Pedi Um Entregadores`;
  - identidade vermelha, preta e branca;
  - ID instalável independente dos apps de lojista e das lojas;
  - abertura direta em `/entregadores?origem=app`;
  - atalhos para entregas e situação dos vínculos.
- Criar ícones próprios normal, adaptável, favicon e ícone do iPhone.
- Aplicar os metadados próprios tanto na página de login quanto na área autenticada, evitando que iPhone ou Android herdem a logo do lojista ou de uma loja.
- Exibir a apresentação própria somente no app instalado de entregadores; os apps das lojas continuam abrindo direto no catálogo.
- Adicionar convite de instalação dentro da área do entregador.

## 6. Banco de dados e segurança

- Criar uma migração para completar o vínculo por loja com estado de ativação, auditoria e unicidade.
- Manter RLS em todas as tabelas envolvidas:
  - lojistas gerenciam apenas entregadores das próprias lojas;
  - entregadores leem apenas os próprios vínculos e entregas;
  - criação de conta e envio de convite acontecem somente no servidor;
  - nenhuma chave administrativa chega ao navegador.
- Usar link de ativação de uso controlado; a loja nunca define nem visualiza a senha do entregador.
- Fazer a transição dos vínculos existentes sem ampliar permissões e sem apagar histórico.

## 7. Validação

- Testar cadastro pela loja, reenvio e expiração do convite, ativação, login por senha/código e recuperação.
- Testar isolamento entre duas lojas, bloqueio, remoção, reativação e entregador com múltiplas lojas.
- Confirmar atribuição manual/automática e estado online apenas em lojas autorizadas.
- Validar o PWA no Android e os metadados usados pelo iPhone, incluindo instalação independente do app do lojista.
- Verificar desktop e celular, erros, estados vazios e acessibilidade.

## Detalhes técnicos

- A criação administrativa será feita por função de servidor autenticada e com verificação da função do usuário na loja.
- O fluxo será consolidado sobre `delivery_profiles`, `store_couriers` e `couriers`; `delivery_documents` ficará apenas como histórico legado.
- A autorização operacional será derivada do vínculo aprovado por loja, não do antigo status global do perfil.
- O manifesto ganhará um modo exclusivo de entregadores, sem alterar os manifestos atuais do painel e das lojas.
