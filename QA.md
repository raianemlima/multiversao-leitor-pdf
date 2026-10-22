# Critérios de aceitação e testes

## Escopo

- App web estático, em português, sem Vercel, backend, cadastro ou senha.
- PDFs são selecionados localmente. Nenhum arquivo do usuário integra a publicação.
- Não usar cookies, localStorage, sessionStorage ou IndexedDB.
- Não regravar PDFs nem remover a proteção. Anotações são apenas estado em memória.
- Não oferecer salvar, exportar, baixar ou imprimir.
- Abrir o ECA de 162 páginas fornecido, sem senha do proprietário.
- Diferenciar a leitura do PDF de sua camada temporária de marcações.
- Avisar que as marcações somem ao fechar/recarregar ou confirmar troca de arquivo.

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
10. Recarregar: sem documento ou marcações persistentes.
11. Erros: arquivo não PDF, PDF truncado, PDF com senha de abertura, limite de tamanho.
12. Privacidade: registrar requisições após seleção, sem upload/POST ou conteúdo do PDF.

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
