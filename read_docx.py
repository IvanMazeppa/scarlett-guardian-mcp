import sys
import zipfile
import xml.etree.ElementTree as ET

def extract_text_from_docx(docx_path):
    try:
        with zipfile.ZipFile(docx_path) as z:
            xml_content = z.read('word/document.xml')
        tree = ET.fromstring(xml_content)
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        text = []
        for node in tree.iterfind('.//w:t', ns):
            if node.text:
                text.append(node.text)
        return ''.join(text)
    except Exception as e:
        return str(e)

if __name__ == '__main__':
    for path in sys.argv[1:]:
        print(f"--- Contents of {path} ---")
        print(extract_text_from_docx(path))
        print("\n")
