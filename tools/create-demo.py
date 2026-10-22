"""Gera somente o exemplo genérico, nunca o PDF anexado pelo usuário."""
from pathlib import Path
from io import BytesIO
import base64
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor

ROOT = Path(__file__).resolve().parents[1]
pdfmetrics.registerFont(TTFont("DemoSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DemoSerif", "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"))
pdfmetrics.registerFont(TTFont("DemoBold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
buffer = BytesIO()
c = canvas.Canvas(buffer, pagesize=(595.28, 841.89))
c.setTitle("Guia de leitura — documento de demonstração")
c.setAuthor("Multiversão")

def text(x, y, value, font="DemoSans", size=10.5, color="#394b59"):
    c.setFillColor(HexColor(color))
    c.setFont(font, size)
    c.drawString(x, y, value)

def base(page):
    c.setFillColor(HexColor("#ffffff"))
    c.rect(0, 0, 595.28, 841.89, fill=1, stroke=0)
    text(60, 790, "MULTIVERSÃO | LEITOR PDF", "DemoBold", 9, "#233b52")
    text(445, 790, "EXEMPLO", "DemoSans", 8, "#68746e")
    c.setStrokeColor(HexColor("#dbe1dc"))
    c.line(60, 775, 535, 775)
    c.line(60, 62, 535, 62)
    text(60, 44, "Documento de demonstração. Nenhum material de aluno.", size=8, color="#68746e")
    text(516, 44, str(page), size=9)

def para(y, lines):
    for line in lines:
        text(60, y, line)
        y -= 20
    return y

base(1)
text(60, 710, "Ler é construir", "DemoSerif", 28, "#233b52")
text(60, 670, "suas próprias conexões.", "DemoSerif", 28, "#233b52")
text(60, 620, "UM PEQUENO GUIA PARA EXPERIMENTAR", "DemoBold", 9, "#68746e")
para(575, [
    "Este é um PDF de exemplo. Use as ferramentas do leitor para",
    "experimentar grifos, escrita à mão e notas de estudo.",
    "",
    "O PDF permanece intacto. Tudo o que você acrescenta fica",
    "em uma camada separada. Salve uma cópia PDF para guardar.",
])
text(60, 414, "Um trecho para destacar", "DemoBold", 13, "#233b52")
para(380, [
    "Uma boa revisão não precisa repetir cada palavra.",
    "Ela pode começar pela ideia que merece uma segunda leitura.",
    "Grife esta frase e escreva ao lado o que ela faz você lembrar.",
])
text(60, 265, "Sua leitura, seu ritmo", "DemoBold", 13, "#233b52")
para(231, [
    "Use Ler para rolar a página. Use Grifar para marcar um trecho.",
    "Troque para Caneta quando quiser escrever à mão.",
    "Escolha Nota e toque na página para registrar uma ideia.",
])
c.showPage()
base(2)
text(60, 710, "Deixe uma pergunta", "DemoSerif", 28, "#233b52")
text(60, 670, "para a próxima revisão.", "DemoSerif", 28, "#233b52")
para(600, [
    "Você pode anotar uma dúvida ou relacionar dois assuntos.",
    "A nota aparece como um marcador numerado nesta página.",
    "No modo Ler, toque no marcador para abrir o conteúdo.",
])
text(60, 475, "Experimente aqui", "DemoBold", 13, "#233b52")
para(438, [
    "1. Adicione uma nota em qualquer ponto desta página.",
    "2. Volte para Ler e toque no marcador.",
    "3. Mude o zoom: a posição da nota acompanha o documento.",
    "4. Use Desfazer e Refazer para testar as marcações.",
])
text(60, 260, "Tudo continua separado do original.", "DemoSerif", 17, "#233b52")
para(215, [
    "O PWA pode guardar a última leitura no próprio aparelho.",
    "Use Salvar PDF para manter uma cópia de segurança.",
])
c.showPage()
base(3)
text(60, 710, "Um espaço em branco", "DemoSerif", 28, "#233b52")
text(60, 670, "também faz parte.", "DemoSerif", 28, "#233b52")
para(600, [
    "Use esta página para testar a escrita à mão.",
    "Escolha a espessura do traço e a cor na barra de ferramentas.",
])
c.setStrokeColor(HexColor("#e4e8e3"))
for y in range(500, 150, -36):
    c.line(60, y, 535, y)
text(60, 110, "Sem cadastro. Sem upload. Sem modificar seu PDF.", size=9, color="#68746e")
c.save()
encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
(ROOT / "public/demo-data.js").write_text(f'export default "{encoded}";\n')
print("Exemplo genérico de 3 páginas gerado.")
