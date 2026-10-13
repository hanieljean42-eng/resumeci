# -*- coding: utf-8 -*-
"""OCR des PDF SVT 4eme (polices sans table Unicode) -> _extracts_4eme_ocr/"""
import sys, os, glob
import fitz, numpy as np
from rapidocr_onnxruntime import RapidOCR

SRC = r'Cours_4eme/Sciences de la Vie et de la Terre'
DST = r'_extracts_4eme_ocr'
os.makedirs(DST, exist_ok=True)

ocr = RapidOCR()
pdfs = sorted(glob.glob(os.path.join(SRC, '*.pdf')))
if len(sys.argv) > 1:
    pdfs = [p for p in pdfs if sys.argv[1].lower() in os.path.basename(p).lower()]

for pdf in pdfs:
    name = os.path.basename(pdf).replace('.pdf', '')
    out = os.path.join(DST, name + '.txt')
    if os.path.exists(out) and os.path.getsize(out) > 500:
        print('SKIP', name); continue
    doc = fitz.open(pdf)
    parts = []
    for i, pg in enumerate(doc):
        pix = pg.get_pixmap(dpi=160)
        img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
        res, _ = ocr(img)
        if res:
            parts.append('\n'.join(l[1] for l in res))
    open(out, 'w', encoding='utf-8').write('\n\n'.join(parts))
    print('OK', name, len(doc), 'pages')
