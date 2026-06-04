import sys
from pypdf import PdfReader

reader = PdfReader(r"C:\Users\GISLAINE\Downloads\ConciliaAI Escopo Projeto 08-05.pdf")
out = []
for i, page in enumerate(reader.pages, 1):
    out.append(f"\n========== PAGE {i} ==========\n")
    out.append(page.extract_text() or "")

with open(r"C:\Users\GISLAINE\.verdent\verdent-projects\segue-o-escopo-completo\concilia_escopo.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(out))

print("OK", sum(len(s) for s in out), "chars")
