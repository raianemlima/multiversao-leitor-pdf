# Multiversão | Leitor PDF

PWA estática em português para leitura local e offline, com grifos, caneta,
notas, retomada da última leitura e exportação de uma cópia PDF anotada.
Sem Vercel, backend, cadastro, senha do app ou servidor de documentos.

## Funcionalidades

- Abrir PDF do próprio dispositivo, com PDF.js 5.6.205.
- Uma página por vez para limitar o uso de memória em celulares/tablets.
- Navegação por página e zoom.
- Grifo retangular, escrita à mão, notas de texto e borracha.
- Desfazer/refazer por página.
- Marcações normalizadas por coordenadas e alinhadas no zoom.
- Confirmação antes de trocar a última leitura ou apagar dados locais.
- Service worker prepara os recursos para uso sem internet.
- CacheStorage mantém a última leitura e marcações no próprio navegador.
- PDF.js faz atualização incremental com Highlight, Ink e nota FreeText/Popup.
  O conteúdo original e sua criptografia não são removidos.
- Original preservado; a exportação gera outro arquivo.
- Identidade e imagens da marca Multiversão fornecidas pelo usuário.
- Suporte: multiversaoempreendimentos@gmail.com; WhatsApp (88) 921957455.

## Limites explícitos

Não remove senha ou proteção e não sobrescreve o arquivo original.
Não abre PDFs que exigem senha de abertura. Não interpreta DRM proprietário.
Para gravar marcações no PDF, respeita a permissão de anotação do arquivo.
Notas exportadas usam um marcador FreeText com comentário Popup, para não cobrir
o material com longos parágrafos. Outros leitores precisam suportar comentários.
É uma PWA, não um APK. Testes em emulação não comprovam funcionamento físico
de Samsung, S Pen, Apple Pencil ou Safari no iPad.

O PDF e a foto enviados para diagnóstico não devem integrar o repositório,
a publicação ou exemplos. O exemplo incluído é material genérico de demonstração.

## Executar

Use Node.js 22.13 ou posterior para desenvolvimento e testes.
O app entregue é estático e não exige Node.js no aparelho do aluno.

```sh
npm install
npm run build
npm run dev
```

Publique apenas `public/` em hospedagem estática HTTPS compatível.
O serviço precisa servir JavaScript e service workers com tipos MIME corretos.
Não há dependência da Vercel. Hospedagem e publicação definitiva precisam ser
configuradas e autorizadas separadamente do desenvolvimento.

A prévia em iframe/sites.pplx.app não é um endereço de instalação: ela bloqueia
armazenamento persistente, instalação e download. Nela, o app mostra um aviso e
não promete essas funções. Elas precisam ser testadas no endereço próprio.

## Instalar e usar offline

1. Abrir o endereço próprio HTTPS com internet.
2. Aguardar “Pronto para usar offline”.
3. Instalar pelo menu do Android, ou Compartilhar → Adicionar à Tela de Início
   no Safari do iPad.
4. Abrir um PDF já baixado. O app guarda apenas a última leitura.
5. Retomar essa leitura mesmo sem internet e usar Salvar PDF como backup.

O navegador pode remover dados locais. A instalação não substitui uma cópia
exportada em Arquivos/Downloads. Não há sincronização entre aparelhos.

## Privacidade

O app lê `File.arrayBuffer()` e passa os bytes diretamente para o PDF.js no navegador.
Não existe rota de upload, analytics, telemetria ou chamada a um servidor de documentos.
Fontes, ícones e motor de PDF são hospedados junto com o app.
O preparo inicial requer internet. O service worker guarda somente recursos
estáticos do app. PDFs e marcações ficam em um cache local separado, nunca em
rotas de rede; o worker bloqueia navegações em `/__local__/`.
Apagar a leitura local não apaga arquivos já baixados em Arquivos/Downloads.

## Licenças

PDF.js: Apache-2.0. Lucide: ISC. Fontes: licenças incluídas nas pastas de distribuição.
O exemplo de estudo é original, gerado para esta interface.
O logotipo Multiversão pertence ao usuário e não foi redesenhado.
