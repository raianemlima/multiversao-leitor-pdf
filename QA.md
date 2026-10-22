# Critérios de aceitação e testes | Multiversão PWA

## Resultado da PWA em 22/10/2026

Versão dos recursos offline: `357e56a44c47`. Motor PDF.js `6.4.299`.

A dependência foi atualizada após a auditoria identificar uma versão afetada pelo
[alerta CVE-2026-16633](https://github.com/advisories/GHSA-hq66-cqwq-w95j).
Nova auditoria npm: zero vulnerabilidades conhecidas reportadas.
Scripting e avaliação dinâmica estão explicitamente desativados.
Os testes abaixo foram repetidos após a atualização; exportação unitária executada
com Node.js 22.23.4. Adaptadas as APIs de permissões Set, encerramento por
loadingTask e coordenadas de comentários da versão 6.

- Marca Multiversão: imagem original preservada, recortes completos no cabeçalho
  e nos ícones, abertura, manifesto, título e exemplo genérico.
- Contatos conferidos: multiversaoempreendimentos@gmail.com e (88) 921957455.
  Link WhatsApp ativado e destino com telefone `5588921957455` confirmado.
  E-mail ativado em navegador sem cliente de e-mail; endereço segue visível.
- Leitura do ECA protegido: 162 páginas. Página 3 com grifo, caneta e nota.
- Sem internet: recarregamento, botão Retomar, página 3 e três marcações
  recuperadas, geração e download real de uma cópia PDF. Sem erros de execução.
- Cópia baixada: qpdf sem erro de estrutura; 162 páginas; texto da capa e
  marca-d'água preservados; bytes originais mantidos como prefixo integral;
  parâmetros da criptografia mantidos; Highlight, Ink e FreeText/Popup.
- Reabertura: comentário nativo da cópia é acessível no app como nota do arquivo,
  sem duplicação. Marcações novas e as da última leitura seguem editáveis.
- Exportação repetida: sem duplicar anotações. PDF que proíbe anotação:
  gravação das marcações recusada, sem remover proteção.
- Fluxos de leitura, cores, espessura, grifo, caneta, nota e edição, borracha,
  desfazer/refazer, limpar/cancelar, navegação, zoom e ajustar à largura passaram.
- Apagar leitura local: cancelamento e confirmação passaram; arquivo externo
  não é removido. Documento local desaparece da retomada.
- Arquivo com cabeçalho inválido: rejeitado com aviso, mantendo a leitura.
- Atualização do service worker: preservou os três marcadores locais.
- Layouts 1440×1000, 375×812, 820×1180 e 1280×600 inspecionados, sem cortes de
  controles nem transbordamento horizontal. Redimensionamento preservou marcas.
- Toque emulado em 375×812: grifo, caneta, cor e retorno ao modo Ler passaram.
- Chrome em contexto privado identificou apenas `in-incognito` na checagem de
  instalação. Instalação física não foi verificada nesse contexto.
- Requisições do app: somente GET para recursos próprios. Abrir PDF, guardar
  leitura e gerar cópia não fizeram upload ou POST.

Correções verificadas: normalização de respostas redirecionadas no cache do
service worker; gravação local imediata por ação concluída, com status coerente;
bloqueio de comandos durante troca de documento; recortes proporcionais da marca.

Limites: Samsung/S Pen, iPad/Safari e Apple Pencil físicos ainda não testados.
O app não remove senhas de abertura, DRM ou permissões. O navegador pode apagar
dados locais. A prévia não é um endereço de instalação e bloqueia download e
persistência. A publicação HTTPS própria foi posteriormente autorizada e
concluída, conforme o registro de publicação definitiva abaixo.

Prévia hospedada atualizada no mesmo artefato e validada em contexto novo:
título e logotipo corretos, exemplo de três páginas, grifo e geração da cópia,
contatos de suporte e aviso explícito de download bloqueado nessa prévia.
Também foi validado iframe opaco com sandbox: ECA protegido de 162 páginas,
grifo e geração da cópia passaram sem erros; botão de download permaneceu
corretamente bloqueado. Telas hospedadas de 1440×1000 e 375×812 inspecionadas,
sem transbordamento; contatos e botão Entendi acessíveis no diálogo rolável.
Sessões de teste da prévia encerradas.

## Publicação definitiva em 22/10/2026

- Endereço: https://multiversao-leitor-pdf.pplx.app
- Visibilidade: Public, confirmada pelo serviço de publicação e por acesso em
  navegador novo, sem conta. Nenhum projeto Vercel foi criado.
- Site ID: `06ed0a42-b238-461d-aac9-c1ad88ac4d54`.
- Artefato: `3ee79ac2-2859-4efd-8dea-bf56cef5d115`.
- Revisão de segurança: PASS, sem BLOCK. Os dois WARN (retenção local possível
  entre abas e endurecimento adicional de CSP) foram apresentados e aceitos
  explicitamente pelo usuário antes de publicar a versão atual.
- HTTPS e página inicial: HTTP 200, marca e título corretos, sem aviso de prévia.
- Manifesto: `application/manifest+json`; service worker: `text/javascript`.
- Chrome em perfil normal: `installabilityErrors: []`.
- Cabeçalhos reais: `X-Content-Type-Options: nosniff` e CSP
  `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`.
  Não foi adicionada uma diretiva script-src pelo app.
- Recursos offline preparados. Com rede desligada: recarregar, retomar o ECA
  de 162 páginas na página 3, recuperar grifo/caneta/nota e baixar a cópia
  anotada passaram no endereço público. Sem erros de execução.
- Cópia efetivamente baixada do site público: qpdf sem erro, prefixo integral
  original, criptografia e texto/marca-d'água da capa preservados; anotações
  nativas e conteúdo da nota presentes; 162 páginas renderizadas por PDFium.
- Reabertura dessa cópia no site: comentário nativo acessível e correto.
- Rota pessoal `/__local__/active.json`: 404 esperado, sem servir dados locais.
- Suporte WhatsApp: link público ativado e telefone de destino confirmado.
- Tela pública 375×812 com toque emulado: grifo, controles e layout passaram,
  sem transbordamento horizontal nem erro de execução.
- Limite mantido: Samsung/S Pen e iPad/Safari/Apple Pencil físicos não testados.
  O navegador pode remover armazenamento local; manter backup em PDF.

Controles de visibilidade publicados:
https://www.perplexity.ai/computer/a/3ee79ac2-2859-4efd-8dea-bf56cef5d115?open-publish=true

## Escopo

- PWA estática, em português, sem Vercel, backend, cadastro ou senha.
- PDFs são selecionados localmente. Nenhum arquivo do usuário integra a publicação.
- Não usar cookies, localStorage, sessionStorage ou IndexedDB.
- Não sobrescrever o original nem remover a proteção.
- Exportar uma cópia PDF com anotações nativas, preservando texto e marca-d'água.
- Abrir o ECA de 162 páginas fornecido, sem senha do proprietário.
- Guardar a última leitura em CacheStorage quando disponível.
- Service worker, manifesto e ícones de instalação com a marca Multiversão.
- Sem rede: recarregar, retomar leitura, marcar, navegar e exportar.
- Na prévia, explicar claramente os limites de iframe e de instalação.
- Marca e contatos comerciais exatamente como fornecidos.

## Fluxos e controles

1. Estado inicial: abrir PDF, exemplo, ajuda, informação de privacidade e de sessão.
2. Seleção de arquivo real: ler primeira página e ir às páginas 3 e 162.
3. Próxima/anterior, entrada de página, limites e contador.
4. Zoom: aumentar, diminuir, ajustar à largura e manter alinhamento das marcações.
5. Modos Ler, Grifar, Caneta, Nota e Borracha; cores e espessuras.
6. Desenhar grifo e traço com mouse/toque. Adicionar nota, reler e editar.
7. Desfazer, refazer, apagar página (cancelar/confirmar), marcações independentes por página.
8. Trocar PDF: alerta de perda de marcações, cancelar/confirmar.
9. Ajuda: abrir/fechar por botão e Escape; foco e nomes acessíveis.
10. Recarregar: oferecer retomar documento e marcações locais.
11. Erros: arquivo não PDF, PDF truncado, PDF com senha de abertura, limite de tamanho.
12. Privacidade: registrar requisições após seleção, sem upload/POST ou conteúdo do PDF.
13. Exportar, baixar pelo navegador, validar com outro motor e reabrir no app.
14. Não duplicar anotações em exportações repetidas.
15. PDF que proíbe anotação: recusar exportação das marcações sem remover proteção.
16. Apagar leitura local e confirmar ausência após recarregar.
17. Manifesto e cache completo: avaliar instalação com auditoria do navegador.
18. Contatos de suporte, imagens da marca e prévia com aviso de restrições.

## Matriz visual e responsiva

- Desktop 1440×1000, telefone 375×812, tablet 820×1180 e janela baixa 1280×600.
- Estado inicial e documento com grifo/nota visíveis.
- Sem overflow horizontal da página; overflow do documento só no zoom intencional.
- Ferramentas, paginação e aviso de sessão acessíveis no telefone.
- Desktop → telefone → desktop no mesmo contexto mantém estado e alinhamento.
- Canvas contém conteúdo real, não apenas um contêiner vazio.
- Sem erros JavaScript não tratados, botões fictícios ou controles inacessíveis.

## Limites de validação

Emulação não substitui aparelhos reais. Não prometer validação física de Samsung,
S Pen, Apple Pencil ou Safari em iPad sem testes nesses dispositivos.

## Histórico da versão inicial em 22/10/2026

Os resultados abaixo documentam a v1 sem salvamento. O novo requisito de PWA com
persistência local e exportação substitui a perda de marcações no recarregamento.

- Chromium desktop: arquivo de diagnóstico aberto sem senha; páginas 1, 3, 161 e
  162 exibidas. Grifo, caneta e nota criados em camada separada.
- Navegação, primeira/última página, zoom 120% e retorno a 100%, desfazer/refazer,
  borracha, confirmação de limpeza e de troca de arquivo exercitados.
- Nota aberta e editada. Marcações preservadas na navegação entre páginas,
  mas descartadas no recarregamento, como solicitado.
- Chromium com emulação de toque: grifo e traço criados por eventos de toque
  reais do protocolo do navegador; nota adicionada/aberta; desfazer/refazer por toque.
- Ajustes responsivos conferidos em 1440×1000, 375×812, 360×800, 820×1180
  e 1280×600. Ciclo desktop → telefone → desktop manteve coordenadas dos grifos.
- Corte na barra de ferramentas do telefone corrigido. Rodapé do tablet corrigido
  para não quebrar as dicas palavra por palavra. Sem overflow horizontal
  não intencional nas larguras conferidas.
- PDF inválido, PDF truncado e PDF com senha de abertura geraram mensagens
  específicas. Nenhuma senha foi solicitada ou tentada pelo app.
- Nenhum POST, upload ou requisição a host externo observado. Motor, fontes e
  ícones foram carregados do próprio host do app. Nenhum erro JavaScript não
  tratado observado no fluxo final.
- Contraste do texto secundário do rodapé: 5,92:1.
- Inspeção de `public/`: PDF e foto do usuário ausentes, assim como identificadores
  pessoais presentes na marca-d'água. O exemplo é genérico.
- O limite de 100 MB foi conferido por inspeção de código; não foi medido como
  limite de desempenho em aparelho real.
- A versão web ainda precisa ser experimentada nos aparelhos físicos do usuário.

## Correção do aviso no iPhone (22/10/2026)

- Sintoma: no Safari do iPhone, o PDF de 111 páginas aparecia, mas surgia
  "Não foi possível exibir esta página".
- Causas tratadas: as opções antigas de fontes e CMaps eram ignoradas pelo
  PDF.js 6 (agora `BinaryDataFactory` local); o limite de memória de canvas do
  Safari (nova tentativa em resolução menor, teto de 5 MP); redesenho a cada
  mudança de altura da barra do Safari (agora só quando a largura muda); texto
  acessível e notas do PDF deixaram de bloquear a página quando falham.
- Testes: perfil iPhone com toque, limite de canvas simulado, variação de
  altura, navegação, zoom de 180% e download da cópia anotada (qpdf sem erro).
  Site público republicado (service worker 79a49835c118), sem erros.
- Limite: WebKit real indisponível neste ambiente; confirmar no iPhone.

## Notas visíveis e toque com o dedo (22/10/2026)

- Notas: a cópia exportada mostra o texto completo da nota em um cartão claro
  (carimbo de fundo + texto livre), legível no visualizador do iPhone/iPad, que
  não abre comentários pop-up. O comentário continua anexado e o app reabre a
  nota pelo marcador.
- Toque: seleção de texto, lupa e menu de pressão longa bloqueados no leitor
  (inputs e textarea continuam editáveis); toque liberado assim que a página é
  desenhada; redesenho por quadro; caneta com filtro de pontos próximos.
- Grifo: passada do dedo se ajusta às linhas do texto, do ponto inicial ao
  final, respeitando colunas; páginas sem texto (digitalizadas) usam faixa com
  altura mínima de uma linha. Um grifo de várias linhas desfaz em um passo.
- Testes: toques CDP em perfil iPhone no ECA (duas colunas), caneta, nota,
  exportação (qpdf sem erro, render poppler) e reabertura da cópia com nota.

## Tela de leitura limpa (22/10/2026)

- Barra superior única e fina (marca, nome do arquivo, Salvar, ajuda, abrir);
  ferramentas na barra inferior; cores/traço em pílula flutuante só ao grifar
  ou escrever; páginas e zoom em pílula escura flutuante no modo Ler; fundo
  cinza neutro com a página em destaque; dicas como aviso breve.
- Toque na página (modo Ler) alterna tela cheia, sem barras.
- Testado em 390×844 com toque e 1366×860: sem transbordamento, grifo por
  passada, nota, desfazer/refazer, exportação e ajuda funcionando, sem erros.
