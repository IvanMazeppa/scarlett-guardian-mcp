import sys
import docx

for path in sys.argv[1:]:
    print(f"--- {path} ---")
    doc = docx.Document(path)
    for para in doc.paragraphs:
        print(para.text)
