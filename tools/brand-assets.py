"""Recorta e redimensiona a marca enviada, sem redesenhar seus elementos."""
from pathlib import Path
import argparse
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("input")
args = parser.parse_args()
source = Image.open(args.input).convert("RGB")
root = Path(__file__).resolve().parents[1] / "public" / "brand"
root.mkdir(parents=True, exist_ok=True)
# Recortes relativos às dimensões reais, preservando os elementos completos.
# A visualização do anexo pode ser menor que o PNG original de 1536 x 1024.
width, height = source.size
def relative_crop(box):
    left, top, right, bottom = box
    return source.crop((round(left * width), round(top * height),
                        round(right * width), round(bottom * height)))
wordmark = relative_crop((.18, .61, .85, .805))
wordmark.thumbnail((870, 160), Image.Resampling.LANCZOS)
wordmark.save(root / "wordmark.webp", "WEBP", quality=95)
logo = source.copy()
logo.thumbnail((800, 534), Image.Resampling.LANCZOS)
logo.save(root / "logo.webp", "WEBP", quality=91)
symbol = relative_crop((.34, .20, .70, .615))
for size in [192, 512]:
    icon = Image.new("RGB", (size, size), "white")
    mark = symbol.copy()
    mark.thumbnail((int(size * .78), int(size * .78)), Image.Resampling.LANCZOS)
    icon.paste(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    icon.save(root / f"icon-{size}.png", optimize=True)
icon = Image.new("RGB", (512, 512), "white")
mark = symbol.copy()
mark.thumbnail((320, 320), Image.Resampling.LANCZOS)
icon.paste(mark, ((512 - mark.width) // 2, (512 - mark.height) // 2))
icon.save(root / "icon-maskable.png", optimize=True)
print("Marca Multiversão preparada a partir do arquivo fornecido.")
