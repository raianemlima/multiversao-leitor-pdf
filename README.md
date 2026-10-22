# Leitor de estudo

Aplicativo web estático em português para leitura local de PDFs e marcações temporárias.
Sem Vercel, servidor de documentos, cadastro, senha do app ou armazenamento persistente.

## Funcionalidades

- Abrir PDF do próprio dispositivo, com PDF.js 5.6.205.
- Uma página por vez para limitar memória em celulares/tablets.
- Navegação por página e zoom.
- Grifo retangular, escrita à mão, notas de texto e borracha.
- Desfazer/refazer por página.
- Marcações normalizadas por coordenadas e alinhadas no zoom.
- Aviso e confirmação antes de descartar marcações ao trocar de PDF.
- Todo estado fica em memória. Recarregar/fechar apaga documento e marcações.

## Limites explícitos

Não remove senha ou proteção, não regrava o arquivo e não exporta marcações.
Não abre PDFs que exigem senha de abertura. Não interpreta DRM proprietário.
É um app web, não um APK. Testes em emulação não comprovam funcionamento físico
de Samsung, S Pen, Apple Pencil ou Safari no iPad.

O PDF e a foto enviados para diagnóstico não devem integrar o repositório,
a publicação ou exemplos. O exemplo incluído é material genérico de demonstração.

## Executar

```sh
npm install
npm run build
npm run dev
```

Publique apenas `public/` em hospedagem estática compatível. Não há dependência
da Vercel. Também pode ser hospedado em GitHub Pages ou serviço estático equivalente,
depois de configurar a publicação e validar a URL escolhida.

## Privacidade

O app lê `File.arrayBuffer()` e passa os bytes diretamente para o PDF.js no navegador.
Não existe rota de upload, analytics, telemetria ou chamada a um servidor de documentos.
Fontes, ícones e motor de PDF são hospedados junto com o app.
O site ainda precisa de conexão para carregar inicialmente; uso offline não é prometido.

## Licenças

PDF.js: Apache-2.0. Lucide: ISC. Fontes: licenças incluídas nas pastas de distribuição.
O exemplo de estudo é original, gerado para esta interface.
