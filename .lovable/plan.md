# Identidade do aplicativo PWA

## Objetivo
Completar a área **Super Admin → Identidade visual** com três imagens próprias do aplicativo instalável:

- **Ícone do aplicativo**: imagem quadrada usada na instalação e na tela inicial.
- **Ícone adaptável**: versão com margem segura para recortes de Android.
- **Tela de abertura**: imagem de apresentação vinculada à experiência do aplicativo.

## Implementação
1. Adicionar campos exclusivos para essas três imagens na identidade visual da plataforma, preservando favicon e capa social existentes.
2. Incluir os três controles de envio, prévia, troca e restauração na seção “Aplicativo PWA”.
3. Validar formato, tamanho máximo e proporção adequada; otimizar as imagens antes do envio.
4. Servir o manifesto do aplicativo dinamicamente para que os ícones escolhidos pelo Super Admin sejam usados na instalação.
5. Aplicar os ícones tanto no aplicativo público quanto no painel do lojista, mantendo os arquivos padrão como fallback.
6. Usar a tela de abertura na apresentação visual de instalação; em celulares, a abertura nativa continuará sendo composta pelo sistema operacional com ícone e cor do aplicativo.

## Validação
- Conferir salvamento, carregamento e restauração dos três campos.
- Validar o manifesto público e o manifesto do painel.
- Executar testes de tipos e testes específicos da identidade visual.
- Verificar a página pública em desktop e celular sem erros no navegador.

## Detalhes técnicos
- Manifesto e ícones apenas; não será adicionado cache offline nem service worker.
- A atualização dos ícones em aplicativos já instalados pode exigir reinstalação no celular.
- A gravação continuará restrita a Super Admin e os arquivos permanecerão no armazenamento privado já usado pela identidade visual.
