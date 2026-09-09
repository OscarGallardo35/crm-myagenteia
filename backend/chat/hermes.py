"""
Hermes session bridge — expone las sesiones y conversaciones reales del agente Hermes
(localizadas en /root/.hermes/state.db del host, montado como volumen en el contenedor).

Rutas:
  GET /api/chat/hermes/sessions/         -> últimas sesiones (con preview)
  GET /api/chat/hermes/sessions/<sid>/   -> mensajes de una sesión
  GET /api/chat/hermes/models/           -> modelos reales disponibles (de config.yaml hermes)
"""
import os
import sqlite3
import json
from datetime import datetime

from rest_framework.decorators import api_view
from rest_framework.response import Response

# Path al state.db de Hermes (montado como volumen read-only en el contenedor)
STATE_DB = os.environ.get("HERMES_STATE_DB", "/hermes/state.db")
MODELS_JSON = os.environ.get("HERMES_MODELS_JSON", "/hermes/crm/models.json")
GATEWAY_URL = os.environ.get("HERMES_GATEWAY_URL", "").rstrip('/')
GATEWAY_MODEL = os.environ.get("HERMES_GATEWAY_MODEL", "hermes-agent")

EXCLUDED_PREFIXES = ("cron_", "_cron", "claude_", "codex_", "opencode_")

USER_ROLES = ("user", "human")
ASSISTANT_ROLES = ("assistant", "ai", "model")


def _get_conn():
    if not os.path.exists(STATE_DB):
        return None
    conn = sqlite3.connect(f"file:{STATE_DB}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _gateway_key():
    """Lee API_SERVER_KEY del config .env de Hermes (montado /hermes/.env)."""
    try:
        env_path = os.environ.get("HERMES_ENV_FILE", "/hermes/.env")
        if os.path.exists(env_path):
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("API_SERVER_KEY=") and not line.startswith('#'):
                        return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return os.environ.get("HERMES_GATEWAY_KEY", "")


def _read_models():
    """Prioriza el catálogo local curado (models.json del CRM: solo los modelos que
    Oscar quiere en el selector, incluidos los de Command Code). Usa el catálogo del
    gateway SOLO si el local no existe/no es legible — el catálogo del gateway entero
    mezcla 25 modelos de pago de Fireworks y Copilot que no deberían aparecer."""
    local = _read_local_models()
    if local:
        return local
    return _read_gateway_models()


def _read_local_models():
    """Lee models.json del CRM (curado a mano)."""
    if os.path.exists(MODELS_JSON):
        try:
            with open(MODELS_JSON) as f:
                data = json.load(f)
            models = []
            for m in data if isinstance(data, list) else data.get("models", []):
                mid = m.get("id", "") if isinstance(m, dict) else str(m)
                if not mid:
                    continue
                parts = mid.split("/")
                provider = m.get("provider") if isinstance(m, dict) else (parts[0] if len(parts) > 1 else "hermes")
                label = m.get("label") if isinstance(m, dict) else mid.split("/")[-1]
                models.append({"id": mid, "label": label or mid.split("/")[-1], "provider": provider})
            return models[:60] or None
        except Exception:
            return None
    return None


def _read_gateway_models():
    """Catálogo del api_server del gateway como respaldo (si no hay local)."""
    if GATEWAY_URL:
        try:
            key = _gateway_key()
            import urllib.request
            req = urllib.request.Request(
                f"{GATEWAY_URL.replace('/v1', '')}/api/model/options",
                headers={"Authorization": f"Bearer {key}", "User-Agent": "crm-bot"})
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.load(r)
            models = []
            for p in data.get("providers", []):
                slug = p.get("slug", "")
                na = set(p.get("unavailable_models", []) or [])
                for mid in p.get("models", []):
                    mid = str(mid)
                    if not mid or mid in na:
                        continue
                    if slug == "hermes-proxy" or slug == "tokenrouter":
                        continue  # el CRM no manda por el proxy Nous
                    label = mid.split("/")[-1].replace(":free", "").replace("-", " ").replace("_", " ").title()
                    models.append({"id": mid, "label": label, "provider": slug})
            if models:
                return models[:60]
        except Exception:
            pass
    return None


@api_view(["GET"])
def hermes_sessions(request):
    """Lista las últimas sesiones de Hermes (excluye cron y delegaciones internas)."""
    conn = _get_conn()
    if conn is None:
        return Response({"ok": False, "error": "state.db no accesible"}, status=503)

    limit = min(int(request.query_params.get("limit", 20)), 100)
    try:
        rows = conn.execute(
            """
            SELECT id, title, display_name, chat_type, session_key,
                   last_activity_at, message_count, pinned
            FROM sessions
            WHERE last_activity_at IS NOT NULL
              AND substr(id, 1, 5) != 'cron_'
              AND substr(id, 1, 1) != '_'
            ORDER BY last_activity_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    except sqlite3.OperationalError:
        # fallback: si 'sessions' no existe aún, listar desde messages
        rows = conn.execute(
            """
            SELECT session_id AS id, NULL AS title,
                   MAX(timestamp) AS last_activity_at,
                   COUNT(*) AS message_count, 0 AS pinned
            FROM messages
            WHERE substr(session_id, 1, 5) != 'cron_'
              AND substr(session_id, 1, 1) != '_'
            GROUP BY session_id
            ORDER BY last_activity_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    data = []
    for r in rows:
        title = r["title"] or "(conversación sin título)"
        # preview: último mensaje user o assistant
        preview = _last_preview(conn, r["id"])
        la = r["last_activity_at"]
        displayed = datetime.fromtimestamp(la).strftime("%d/%m %H:%M") if la else ""
        data.append({
            "id": r["id"],
            "title": title,
            "preview": preview,
            "display_name": r["display_name"] or "",
            "chat_type": r["chat_type"] or "",
            "message_count": r["message_count"] or 0,
            "pinned": bool(r["pinned"]),
            "last_activity": la,
            "last_activity_display": displayed,
        })
    return Response({"ok": True, "sessions": data})


def _last_preview(conn, session_id, maxlen=90):
    try:
        row = conn.execute(
            """
            SELECT content FROM messages
            WHERE session_id = ? AND role IN ('user','assistant')
              AND content IS NOT NULL AND length(content) > 3
            ORDER BY timestamp DESC LIMIT 1
            """,
            (session_id,),
        ).fetchone()
        if row and row["content"]:
            return row["content"][:maxlen]
    except sqlite3.OperationalError:
        pass
    return ""


@api_view(["GET"])
def hermes_session_messages(request, session_id):
    """Mensajes de una sesión puntual de Hermes, en orden cronológico."""
    conn = _get_conn()
    if conn is None:
        return Response({"ok": False, "error": "state.db no accesible"}, status=503)

    # metadata de la sesión
    meta = None
    try:
        m = conn.execute(
            "SELECT id,title,display_name,model,last_activity_at FROM sessions WHERE id=?",
            (session_id,),
        ).fetchone()
        if m:
            meta = dict(m)
    except sqlite3.OperationalError:
        pass

    try:
        rows = conn.execute(
            """
            SELECT role, content, timestamp
            FROM messages
            WHERE session_id = ? AND content IS NOT NULL AND length(content) > 0
            ORDER BY timestamp ASC
            """,
            (session_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        return Response({"ok": False, "error": "sesión no leíble"}, status=404)

    msgs = []
    for r in rows:
        role = r["role"]
        buckets = []
        if role in USER_ROLES:
            buckets = ["user"]
        elif role in ASSISTANT_ROLES:
            buckets = ["assistant"]
        elif role in ("tool", "function"):
            buckets = ["tool"]
        else:
            buckets = ["system"]
        msgs.append({
            "role": buckets[0],
            "content": r["content"],
            "created_at": datetime.fromtimestamp(r["timestamp"]).isoformat()
            if r["timestamp"] else "",
        })

    return Response({
        "ok": True,
        "session": {
            "id": session_id,
            "title": (meta or {}).get("title") or "(sin título)",
            "model": (meta or {}).get("model") or "",
            "message_count": len(msgs),
        },
        "messages": msgs,
    })


@api_view(["GET"])
def hermes_models(request):
    """Modelos reales de Hermes para el selector del chat."""
    models = _read_models()
    if models is None:
        return Response({"ok": False, "models": []})
    return Response({"ok": True, "models": models})
