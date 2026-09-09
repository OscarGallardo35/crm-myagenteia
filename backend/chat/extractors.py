"""Extracción de texto de documentos y OCR para el chat del CRM."""
import os
import subprocess
from django.conf import settings


def extract_document_text(file_path, mime):
    """Extrae texto de un documento según su MIME type."""
    if not os.path.exists(file_path):
        return ''
    ext = os.path.splitext(file_path)[1].lower()
    
    # Texto plano / markdown / código
    if mime in ('text/plain', 'text/markdown', 'text/x-python', 'text/javascript', 'application/json') or ext in ('.txt', '.md', '.py', '.js', '.json', '.csv', '.log', '.html', '.css'):
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()
        except Exception:
            return ''
    
    # PDF
    if mime == 'application/pdf' or ext == '.pdf':
        try:
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                texts = []
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        texts.append(t)
                return '\n\n'.join(texts)
        except Exception:
            # fallback pdftotext
            try:
                result = subprocess.run(['pdftotext', file_path, '-'], capture_output=True, text=True, timeout=30)
                return result.stdout
            except Exception:
                return ''
    
    # DOCX
    if mime == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' or ext == '.docx':
        try:
            from docx import Document
            doc = Document(file_path)
            return '\n'.join(p.text for p in doc.paragraphs)
        except Exception:
            return ''
    
    # DOC ( viejo )
    if mime == 'application/msword' or ext == '.doc':
        try:
            result = subprocess.run(['antiword', file_path], capture_output=True, text=True, timeout=30)
            return result.stdout
        except Exception:
            return ''
    
    return ''


def transcribe_audio(file_path):
    """Transcribe audio usando faster-whisper local (el skill audio-transcription de Hermes)."""
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel("tiny", device="cpu", compute_type="int8")
        segments, info = model.transcribe(file_path, beam_size=5, language="es")
        text = " ".join(segment.text for segment in segments)
        return text.strip()
    except Exception:
        return ''


def ocr_image(file_path):
    """OCR de imagen usando tesseract."""
    try:
        result = subprocess.run(['tesseract', file_path, 'stdout', '-l', 'spa+eng'], capture_output=True, text=True, timeout=30)
        return result.stdout.strip()
    except Exception:
        return ''


def generate_image_thumbnail(file_path, size=(300, 300)):
    """Genera un thumbnail de la imagen. Retorna el path del thumbnail."""
    try:
        from PIL import Image
        thumb_path = file_path + '.thumb.jpg'
        img = Image.open(file_path)
        img.thumbnail(size)
        img.save(thumb_path, 'JPEG', quality=85)
        return thumb_path
    except Exception:
        return None
