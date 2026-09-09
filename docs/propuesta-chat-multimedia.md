# Propuesta: Chat Multimedia + Copy-Paste (estilo Claude Web)

> **Fecha:** 2026-09-09 · **CRM:** `crm.mercadodigital.pro` · **Stack:** Django + React 19 + Hermes Agent
>
> **Objetivo:** llevar el chat del CRM al nivel de Claude Web: audio, documentos, imágenes y copy-paste robusto, sin romper el flujo actual (artefactos, zip, model lock, seguridad).

---

## 1. Diagnóstico del estado actual

| Capa | Estado | Evidencia |
|---|---|---|
| **Modelo `Message`** | Solo `content` (texto) + `artifacts` (JSON de bloques code/mermaid/md/txt). **Sin campo de adjuntos.** | `chat/models.py:28-41` |
| **Envío (`crm_conversation_message`)** | Acepta `role` + `content` (texto plano) por JSON. **No multipart, no archivos.** | `chat/views.py:284-314` |
| **Historial al agente (`_build_history`)** | Solo texto plano: `{'role': mm.role, 'content': mm.content}`. **Sin multimedia.** | `chat/views.py:661-670` |
| **Frontend input** | `<input type="text">` simple. **Sin drag-drop, sin paste de imagen, sin file picker.** | `ChatView.jsx:524-538` |
| **Media config** | No hay `MEDIA_URL`/`MEDIA_ROOT` en settings. **Sin storage configurado.** | `config/settings.py` |
| **Agente Hermes** | Recibe texto. Puede leer archivos si se le pasa la ruta (ya lee `auth.log`, `crm_output/`). **Puede transcribir audio** si se le pasa un archivo. | `security/worker.py`, `chat/views.py:499` |
| **Copy-paste** | Botón copiar mensaje funciona (`navigator.clipboard.writeText`). **Pegado de imagen/binario no.** | `ChatView.jsx:236-244` |

**Conclusión:** el chat es 100% texto. Para multimedia necesitamos: (a) campo de adjuntos en `Message`, (b) endpoint multipart, (c) storage local (volumen Docker), (d) transcripción audio vía agente, (e) visor/upload en frontend.

---

## 2. Propuesta de funcionalidades

### 2.1. Audio (notas de voz)
- **Frontend:** botón micrófono → `MediaRecorder` API → `.webm`/`.wav` → se adjunta al mensaje.
- **Backend:** guarda archivo en `MEDIA_ROOT/audios/<conv_id>/`, crea `Message` con `role=user` + `content=""` + `attachments=[{type:"audio", url, duration}]`.
- **Agente:** al recibir un attachment `audio`, el backend **transcribe** (Whisper local o el propio agente) y mete la transcripción en el `content` que el agente procesa. El agente responde sobre la transcripción; el usuario conserva el audio original.
- **UI:** reproductor de audio en el mensaje + texto transcrito como `content`.

### 2.2. Documentos (PDF, DOCX, TXT, MD)
- **Frontend:** file picker (`accept=".pdf,.docx,.doc,.txt,.md,.py,.js,.json,.csv"`) + drag-drop sobre el input.
- **Backend:** guarda en `MEDIA_ROOT/docs/<conv_id>/`, crea `Message` con `attachments=[{type:"document", url, name, size, mime}]`.
- **Agente:** el backend extrae texto (pdf→PyPDF2/pdfplumber, docx→python-docx, txt→directo) y lo inyecta al `content` del mensaje que el agente procesa, con un prefijo `[Documento: <nombre>]\n<contenido>`. El agente "lee" el documento.
- **UI:** tarjeta de documento (icono + nombre + tamaño) + texto extraído visible.

### 2.3. Imágenes
- **Frontend:** file picker (`accept="image/*"`) + **paste desde clipboard** (captura `ClipboardEvent` → `e.clipboardData.items` → imagen).
- **Backend:** guarda en `MEDIA_ROOT/images/<conv_id>/`, crea `Message` con `attachments=[{type:"image", url, name, mime}]`.
- **Agente:** el modelo actual (DeepSeek V4 Flash vía Command Code) **no es multimodal**. Opciones:
  - **(a) Usar un modelo vision** (DeepSeek V4 Flash Vision, MiniMax M3) cuando se detecta imagen → el model lock ya soporta cambio por sesión.
  - **(b) OCR local** (tesseract) + pasar texto al agente.
  - **(c) Descripción manual** (el usuario describe) — fallback.
- **UI:** thumbnail clickeable (modal) + caption opcional.

### 2.4. Copy-paste robusto (estilo Claude Web)
- **Pegado de texto:** ya funciona (input estándar).
- **Pegado de imagen:** interceptar `onPaste` en el input → si hay imagen en clipboard, subir como attachment de imagen.
- **Pegado de archivo:** interceptar `onPaste`/`onDrop` → subir como documento.
- **Drag & drop:** zona de drop sobre el área de chat con feedback visual.
- **Copiar respuesta:** ya funciona (botón `⧉ Copiar`). Extender a "copiar solo texto" vs "copiar todo".

---

## 3. Arquitectura de la solución

### 3.1. Modelo de datos (migración 0004)

```python
# chat/models.py — Message
class Message(models.Model):
    ...
    # Nuevo: adjuntos multimedia (lista de {type, url, name, size, mime, duration})
    attachments = models.JSONField(default=list, blank=True, null=True)
```

**Tipos de attachment:**
```json
{"type": "audio", "url": "/media/audios/33/voz_1.webm", "name": "voz_1.webm", "size": 45200, "mime": "audio/webm", "duration": 12}
{"type": "document", "url": "/media/docs/33/requerimientos.pdf", "name": "requerimientos.pdf", "size": 120500, "mime": "application/pdf"}
{"type": "image", "url": "/media/images/33/captura.png", "name": "captura.png", "size": 89000, "mime": "image/png"}
```

### 3.2. Storage

```python
# config/settings.py
MEDIA_URL = '/media/'
MEDIA_ROOT = '/app/media/'  # montado en docker-compose como volumen persistente
FILE_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024  # 20 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024
```

```yaml
# docker-compose.yml (backend)
volumes:
  - ./media:/app/media
```

### 3.3. Endpoint de envío (multipart)

```python
# chat/views.py — nuevo endpoint
@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def crm_conversation_upload(request, pk):
    """Sube archivos (audio/documento/imagen) y crea el mensaje del usuario.
    El campo 'content' es opcional (puede ir vacío si solo hay adjunto)."""
    files = request.FILES.getlist('files')  # multipart
    content = request.data.get('content', '')
    attachment_type = request.data.get('type', 'document')  # audio|document|image
    ...
    # guardar archivo, crear Message con attachments, lanzar agente
```

**Ruta:** `POST /api/chat/conversations/<pk>/upload/`

### 3.4. Integración con el agente

El agente **siempre recibe texto** (el modelo no es multimodal por defecto). El backend hace la conversión:

```python
def _prepare_user_content(message):
    """Convierte un Message (texto + attachments) en el texto que el agente procesa."""
    parts = []
    if message.content:
        parts.append(message.content)
    for att in (message.attachments or []):
        if att['type'] == 'audio':
            # transcribir
            transcription = transcribe_audio(att['url'])
            parts.append(f"[Nota de voz transcrita]: {transcription}")
        elif att['type'] == 'document':
            text = extract_document_text(att['url'], att['mime'])
            parts.append(f"[Documento: {att['name']}]\n{text}")
        elif att['type'] == 'image':
            # si hay modelo vision en la sesión, pasar la URL/path directo
            # si no, OCR
            text = ocr_image(att['url']) if not vision_model else f"[Imagen: {att['url']}]"
            parts.append(text)
    return "\n\n".join(parts)
```

### 3.5. Frontend

**Nuevo componente:** `ChatInput.jsx` (extraído del input de ChatView):
- `<textarea>` (multilínea, auto-resize) en vez de `<input>` (permite shift+enter).
- Botón micrófono → `MediaRecorder`.
- Botón adjuntar → `<input type="file" hidden>`.
- Zona de previsualización de adjuntos (chips: 🎵 audio, 📄 doc, 🖼️ imagen con thumbnail).
- `onPaste` → detecta imagen/archivo.
- `onDrop` → drag-drop.

**Nuevo componente:** `AttachmentCard.jsx`:
- Audio: `<audio controls>`.
- Documento: icono + nombre + tamaño + botón descargar.
- Imagen: thumbnail + modal.

**Modificado:** `MessageList.jsx` (o dentro de ChatView) → renderiza `attachments` del mensaje además del `content`.

---

## 4. Plan de implementación (por fases)

### Fase 1: Infraestructura de adjuntos (backend) — 1h
- [ ] Campo `attachments` en `Message` + migración 0004.
- [ ] `MEDIA_URL`/`MEDIA_ROOT` en settings + volumen Docker.
- [ ] Endpoint `crm_conversation_upload` (multipart, guarda archivo, crea Message).
- [ ] Helper `_prepare_user_content` (texto + documentos, sin audio/imagen todavía).
- [ ] `_build_history` incluye attachments en el formato que el frontend espera.

### Fase 2: Documentos + copy-paste de texto — 1.5h
- [ ] Extracción de texto: PDF (pdfplumber), DOCX (python-docx), TXT/MD (directo).
- [ ] Frontend: file picker + drag-drop + `onPaste` para archivos.
- [ ] `AttachmentCard` para documentos (icono, nombre, descarga).
- [ ] Prueba e2e: subir PDF → agente lo lee y responde.

### Fase 3: Imágenes — 1.5h
- [ ] Frontend: paste de imagen + file picker image/*.
- [ ] Backend: guarda imagen, thumbnail.
- [ ] Integración vision: detectar imagen → si la sesión tiene modelo vision (MiniMax M3, DeepSeek V4 Vision), pasar path; si no, OCR local (tesseract).
- [ ] `AttachmentCard` para imágenes (thumbnail + modal).
- [ ] Prueba e2e: pegar captura → agente la describe.

### Fase 4: Audio (notas de voz) — 1.5h
- [ ] Frontend: botón micrófono → MediaRecorder → webm.
- [ ] Backend: guarda audio.
- [ ] Transcripción: Whisper local (faster-whisper) o el propio agente (Hermes ya tiene `audio-transcription` skill).
- [ ] `AttachmentCard` para audio (reproductor + transcripción).
- [ ] Prueba e2e: grabar nota → transcribe → agente responde.

### Fase 5: Pulido UX (estilo Claude Web) — 1h
- [ ] Textarea multilínea con auto-resize.
- [ ] Atajos: Enter envía, Shift+Enter nueva línea.
- [ ] Indicador de "grabando audio" con onda.
- [ ] Drag-drop con overlay visual.
- [ ] Contador de archivos/tamaño máximo.
- [ ] Mensajes sin texto (solo adjunto) se muestran limpios.

---

## 5. Archivos a modificar/crear

| Archivo | Acción |
|---|---|
| `backend/chat/models.py` | + campo `attachments` |
| `backend/chat/migrations/0004_message_attachments.py` | migración |
| `backend/config/settings.py` | + `MEDIA_URL`, `MEDIA_ROOT`, `FILE_UPLOAD_MAX_MEMORY_SIZE` |
| `backend/docker-compose.yml` | + volumen `./media` |
| `backend/chat/views.py` | + endpoint `crm_conversation_upload`, + `_prepare_user_content`, mod `_build_history`, mod `_run_agent_background` |
| `backend/chat/urls.py` | + ruta `conversations/<pk>/upload/` |
| `backend/chat/extractors.py` (nuevo) | extracción de texto (PDF/DOCX/TXT), OCR, transcripción |
| `backend/requirements.txt` | + pdfplumber, python-docx, faster-whisper (o tesseract) |
| `frontend/src/components/ChatView.jsx` | refactor input → `ChatInput`, render attachments |
| `frontend/src/components/ChatInput.jsx` (nuevo) | textarea + mic + adjuntar + paste + drag-drop |
| `frontend/src/components/AttachmentCard.jsx` (nuevo) | visor de audio/doc/imagen |
| `frontend/src/lib/api.js` | + `uploadCrmAttachments` |

---

## 6. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Modelo actual no es multimodal | OCR local para imágenes; transcripción local para audio. El agente siempre recibe texto. |
| Tamaño de archivos | Límite 20 MB por archivo, 5 archivos por mensaje. |
| Volumen Docker llenándose | Los archivos viven en `./media` del host (persistente, backupable). Limpieza de sesiones viejas. |
| Transcripción lenta | faster-whisper local (modelo `tiny`/`base` → ~1-2s por nota de voz). |
| Seguridad (archivos subidos por usuario) | Validar MIME + extensión, no ejecutar nunca lo subido, almacenar fuera de `/app` (sin ejecución). |

---

## 7. Estimación total

| Fase | Tiempo |
|---|---|
| 1. Infraestructura adjuntos | 1h |
| 2. Documentos + copy-paste | 1.5h |
| 3. Imágenes | 1.5h |
| 4. Audio | 1.5h |
| 5. Pulido UX | 1h |
| **Total** | **~6.5h** |

---

## 8. Referencias

- [Claude Web](https://claude.ai) — referencia de UX (drag-drop, paste, attachments).
- [Hermes audio-transcription skill](hermes-agent.nousresearch.com) — transcripción con faster-whisper.
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) — grabación de audio en navegador.
- [Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API) — paste de imágenes.
