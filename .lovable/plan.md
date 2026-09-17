# Aplicativo PWA individual para cada loja

## Objetivo
Separar os aplicativos instaláveis em dois tipos:

- **Pedi Um para lojistas:** mantém o aplicativo atual, com abertura no acesso exclusivo do lojista e entrada no painel.
- **Aplicativo da loja:** cada catálogo poderá ser instalado com nome, ícone, cores e abertura próprios, levando diretamente àquela loja.

A estrutura deixará preparado o reconhecimento de um terceiro tipo de aplicativo para motoboys, sem criar esse aplicativo agora.

## Experiência do lojista
1. Reorganizar a área de personalização para apresentar uma seção clara de **Aplicativo da loja**.
2. Permitir configurar e pré-visualizar:
   - nome exibido no celular;
   - ícone quadrado do aplicativo;
   - ícone adaptável para Android;
   - cor do aplicativo, usando por padrão a cor principal da loja;
   - restauração automática para logo, cor e nome da loja quando um campo próprio não estiver definido.
3. Validar formato, tamanho e proporção das imagens antes do envio, com compressão otimizada.
4. Manter a publicação em rascunho: as alterações do aplicativo entram no ar junto com a publicação do visual da loja.

## Aplicativo individual de cada loja
1. Atualizar o manifesto dinâmico para carregar os dados publicados da loja solicitada.
2. Gerar uma identidade estável e exclusiva por loja, preservada mesmo se o endereço público da loja mudar.
3. Abrir diretamente no catálogo correto e incluir atalhos para loja, sacola e acompanhamento de pedidos.
4. Aplicar nome, ícones e cores próprios no Android, iPhone e navegadores compatíveis.
5. Garantir que todas as páginas da jornada da loja usem o manifesto correto: catálogo, sacola, checkout, acompanhamento e área de membros.
6. Tornar o convite de instalação específico por loja, inclusive o estado “dispensado”, para que dispensar uma loja não esconda o convite das demais.
7. Exibir a identidade da loja na abertura do aplicativo instalado, sem mostrar a marca do aplicativo de lojista.

## Separação dos aplicativos
1. Preservar o manifesto atual do painel como aplicativo oficial **Pedi Um para lojistas**.
2. Corrigir a identificação do modo instalado para distinguir `lojista`, `loja` e, futuramente, `motoboy`.
3. Aplicar o redirecionamento ao login exclusivo de lojista somente ao aplicativo do painel.
4. Impedir que o aplicativo de uma loja envie o cliente ao acesso de lojista ou encerre a conta do cliente.
5. Manter o acesso do cliente, os endereços, pedidos e acompanhamento vinculados à loja de origem.

## Segurança e armazenamento
1. Reutilizar o armazenamento de imagens das lojas, mantendo cada arquivo na pasta da respectiva loja.
2. Restringir envio, troca e exclusão das imagens aos responsáveis autorizados daquela loja; visitantes continuam podendo visualizar somente os arquivos publicados necessários ao catálogo e à instalação.
3. Ler no manifesto apenas lojas ativas e publicadas.
4. Não adicionar cache offline nem novo service worker; o worker de notificações existente será preservado.

## Validação
- Testar dois catálogos diferentes e confirmar nomes, ícones, cores, identidade e abertura independentes.
- Confirmar que instalar ou dispensar uma loja não altera a experiência de outra loja.
- Validar o aplicativo do lojista separadamente, incluindo abertura, login e atalhos do painel.
- Conferir catálogo, sacola, checkout, acompanhamento, login do cliente e área do cliente dentro do modo instalado.
- Validar manifestos e imagens em tamanhos de celular, além de testes de tipos e testes automatizados específicos.

## Detalhes técnicos
- Os dados do aplicativo da loja serão incorporados à identidade visual publicada já existente, evitando uma configuração paralela.
- O manifesto continuará dinâmico, mas passará a consultar `stores` e o tema publicado de `store_themes` para a loja solicitada.
- A identidade do manifesto usará o identificador imutável da loja; o endereço de abertura continuará usando o endereço público atual.
- As regras do armazenamento serão ajustadas por migração para remover permissões amplas de escrita e exigir vínculo autorizado com a loja.
- Aplicativos já instalados podem exigir atualização ou reinstalação para receber mudanças de nome, ícone, identidade ou endereço de abertura.
