from pathlib import Path
from typing import List, Dict


class BookParser:
    def parse(self, file_path: str) -> List[Dict]:
        ext = Path(file_path).suffix.lower()
        if ext == ".txt":
            return self._parse_txt(file_path)
        if ext == ".pdf":
            return self._parse_pdf(file_path)
        if ext == ".epub":
            return self._parse_epub(file_path)
        raise ValueError(f"Format non supporté: {ext}")

    def _split_into_chapters(self, paragraphs: List[str], size: int = 20) -> List[Dict]:
        chapters = []
        for i in range(0, len(paragraphs), size):
            chunk = paragraphs[i : i + size]
            chapters.append({"title": f"Chapitre {len(chapters) + 1}", "paragraphs": chunk})
        return chapters or [{"title": "Contenu", "paragraphs": paragraphs}]

    def _parse_txt(self, path: str) -> List[Dict]:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()

        raw = [p.strip() for p in text.split("\n\n") if p.strip()]
        paragraphs = []
        for block in raw:
            lines = [l.strip() for l in block.splitlines() if l.strip()]
            joined = " ".join(lines)
            if len(joined) > 10:
                paragraphs.append(joined)

        return self._split_into_chapters(paragraphs, 20)

    def _parse_pdf(self, path: str) -> List[Dict]:
        try:
            import pdfplumber

            pages = []
            with pdfplumber.open(path) as pdf:
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        pages.append(t.strip())
            text = "\n\n".join(pages)
        except ImportError:
            try:
                import PyPDF2

                with open(path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    pages = [reader.pages[i].extract_text() or "" for i in range(len(reader.pages))]
                text = "\n\n".join(pages)
            except ImportError:
                return [{"title": "Erreur", "paragraphs": ["Installez pdfplumber : pip install pdfplumber"]}]

        paragraphs = [p.strip() for p in text.split("\n\n") if len(p.strip()) > 20]
        return self._split_into_chapters(paragraphs, 15)

    def _parse_epub(self, path: str) -> List[Dict]:
        try:
            import ebooklib
            from ebooklib import epub
            from bs4 import BeautifulSoup

            book = epub.read_epub(path)
            chapters = []
            for item in book.get_items_of_type(ebooklib.ITEM_DOCUMENT):
                soup = BeautifulSoup(item.get_content(), "html.parser")
                title_tag = soup.find(["h1", "h2", "h3"])
                title = title_tag.get_text(strip=True) if title_tag else f"Chapitre {len(chapters) + 1}"
                paras = [p.get_text(" ", strip=True) for p in soup.find_all("p")]
                paras = [p for p in paras if len(p) > 10]
                if paras:
                    chapters.append({"title": title, "paragraphs": paras})
            return chapters or [{"title": "Vide", "paragraphs": ["Aucun contenu trouvé."]}]
        except ImportError:
            return [{"title": "Erreur", "paragraphs": ["Installez ebooklib : pip install ebooklib beautifulsoup4"]}]
