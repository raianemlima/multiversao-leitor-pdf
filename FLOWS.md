# Fluxos preservados e mudança para PWA Multiversão

## Abrir e ler
- Abrir PDF do próprio aparelho, sem upload.
- Exibir quantidade de páginas, navegar, ir para uma página e ajustar zoom.
- Manter mensagem clara para arquivo inválido, truncado e senha de abertura.

## Marcar
- Grifar, usar caneta, escolher cor/espessura, criar/editar nota.
- Reler nota, apagar, desfazer/refazer e limpar página.
- Preservar coordenadas no zoom e no redimensionamento.

## Trocar documento e ajuda
- Pedir confirmação antes de trocar uma leitura com alterações.
- Abrir/fechar ajuda e usar teclado e toque sem erros de console.

## Nova identidade
- Aplicar a marca Multiversão do logotipo fornecido, sem redesenhá-la.
- Cabeçalho, abertura, metadados, manifesto e ícones coerentes.

## Novos requisitos
- Manifesto instalável e service worker para os recursos do app.
- Funcionar offline após preparo completo, em contexto próprio HTTPS/localhost.
- Prévia em iframe deve explicar limitações; não pode fingir instalação offline.
- Guardar a última leitura localmente com CacheStorage, sem APIs bloqueadas de
  localStorage, sessionStorage, IndexedDB ou cookies.
- Retomar PDF e marcações após recarregar e em modo offline.
- Permitir apagar os documentos locais sem desinstalar o app.
- Exportar PDF real com Highlight, Ink e nota FreeText/Popup, preservando texto,
  marca-d'água e criptografia do original; respeitar permissão de anotação.
- Reabrir a cópia e verificar páginas e anotações. Exportar novamente não duplica.
- Permitir salvar/compartilhar no contexto próprio do PWA; a prévia não deve
  prometer downloads que o sandbox bloqueia.
- Não publicar arquivos pessoais. Publicação definitiva requer autorização.
