from rest_framework import viewsets, status
from django.db import models as dj_models
from rest_framework.decorators import api_view, parser_classes
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.contrib.auth.models import User
from django.utils import timezone
from django.conf import settings
from chat.models import Conversation, Message, ModelConfig
from agents.models import AgentTask, AgentLog
from leads.models import Lead, Deal
from posting.models import Post, ScheduledPost
from chat.serializers import (
    ConversationSerializer, MessageSerializer, ModelConfigSerializer,
    AgentTaskSerializer, AgentLogSerializer,
    LeadSerializer, DealSerializer,
    PostSerializer, ScheduledPostSerializer
)
import os
from openai import OpenAI
import json
import uuid
from urllib.parse import urljoin

# Gateway (api_server de Hermes) — chat de sesión no-stream
_GW = os.environ.get('HERMES_GATEWAY_URL', '').rstrip('/')  # http://10.0.3.1:8642/v1

def _gateway_base():
    """Base URL sin el sufijo '/v1' (que es de OpenAI-compat). El [/v]2 api del
    gateway vive en /api/...  Quitar '/v1' completo, no solo el último char."""
    if _GW.endswith('/v1'):
        return _GW[:-3]
    return _GW

GATEWAY_CHAT_URL = (_GW[:-3] if _GW.endswith('/v1') else _GW) + '/api/sessions/{}/chat' if _GW else ''
GATEWAY_SESSIONS_URL = (_GW[:-3] if _GW.endswith('/v1') else _GW) + '/api/sessions' if _GW else ''
GATEWAY_LOCK_URL = (_GW[:-3] if _GW.endswith('/v1') else _GW) + '/api/sessions/{}/model' if _GW else ''

def uuid_hex8():
    return uuid.uuid4().hex[:8]
class ModelConfigViewSet(viewsets.ModelViewSet):
    queryset = ModelConfig.objects.all()
    serializer_class = ModelConfigSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer


class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer


class AgentTaskViewSet(viewsets.ModelViewSet):
    queryset = AgentTask.objects.all()
    serializer_class = AgentTaskSerializer


class AgentLogViewSet(viewsets.ModelViewSet):
    queryset = AgentLog.objects.all()
    serializer_class = AgentLogSerializer


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer


class DealViewSet(viewsets.ModelViewSet):
    queryset = Deal.objects.all()
    serializer_class = DealSerializer


class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer


class ScheduledPostViewSet(viewsets.ModelViewSet):
    queryset = ScheduledPost.objects.all()
    serializer_class = ScheduledPostSerializer


def _read_json_file(path, default=None):
    """Leer un JSON del disco sin romper si falta o está corrupto."""
    if default is None:
        default = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _host_metrics():
    """Métricas del host VPS (escritas por el recolector system_metrics.py)."""
    # /root/.hermes está montado en el contenedor como /hermes (read-only)
    return _read_json_file("/hermes/system_metrics.json", None)


def _gateway_state():
    """Estado del gateway de Hermes (running/draining, plataformas, agentes)."""
    return _read_json_file("/hermes/gateway_state.json")


def _model_tracking():
    """Tracking de uso/errores por modelo (para rate limits reales)."""
    return _read_json_file("/hermes/model_tracking_state.json")


def _model_catalog():
    """Catálogo de modelos activos (models.json del CRM)."""
    data = _read_json_file("/hermes/crm/models.json", [])
    if isinstance(data, dict):
        return data.get("models", data.get("data", [])) or []
    return data if isinstance(data, list) else []


def _domains_summary(domains):
    from collections import Counter
    total = len(domains)
    healthy = sum(1 for d in domains if d.get("healthy"))
    unreachable = sum(1 for d in domains if not d.get("reachable"))
    return {"total": total, "healthy": healthy, "unreachable": unreachable}


def _business_stats():
    """Estadísticas de negocio del CRM (DB)."""
    delta_24h = timezone.now() - timezone.timedelta(hours=24)
    try:
        leads_totals = Lead.objects.count()
        leads_by_status = dict(
            Lead.objects.values("status").annotate(c=dj_models.Count("id"))
            .order_by("-c")
        )
        new_leads_24h = Lead.objects.filter(created_at__gte=delta_24h).count()
        conversations_active = Conversation.objects.filter(
            updated_at__gte=delta_24h
        ).count()
        messages_24h = Message.objects.filter(created_at__gte=delta_24h).count()
        posts_scheduled = Post.objects.filter(status="scheduled").count()
        posts_next_7d = Post.objects.filter(
            status="scheduled", scheduled_at__gte=timezone.now(),
            scheduled_at__lte=timezone.now() + timezone.timedelta(days=7),
        ).count()
        agent_tasks_running = AgentTask.objects.filter(
            status="running").count()
        agent_tasks_completed = AgentTask.objects.filter(
            status="completed").count()
        return {
            "leads_total": leads_totals,
            "leads_by_status": leads_by_status,
            "new_leads_24h": new_leads_24h,
            "conversations_active": conversations_active,
            "messages_24h": messages_24h,
            "posts_scheduled": posts_scheduled,
            "posts_next_7d": posts_next_7d,
            "agent_tasks_running": agent_tasks_running,
            "agent_tasks_completed": agent_tasks_completed,
        }
    except Exception as e:
        return {"error": str(e)}


def _model_rate_limits():
    """Rate limits y salud REALES por modelo (catálogo + tracking)."""
    tracking = _model_tracking()
    catalog = _model_catalog()

    # index de tracking por id normalizado (claves "provider::model" -> "provider/model")
    tmap = {}
    for key, val in tracking.items():
        tmap[key.replace("::", "/")] = val

    out = []
    # 1) SIEMPRE el catálogo real (lo que usa el selector de modelos del CRM)
    for m in catalog:
        mid = m.get("id") or m.get("model") or ""
        if not mid:
            continue
        # catalogar como free si el id lo indica o el label (ej. "LongCat 2.0 - free")
        id_free = "free" in mid.lower() or ":free" in mid.lower()
        lbl_free = "free" in (m.get("label") or "").lower()
        t = tmap.get(mid, {})
        out.append({
            "model": mid,
            "label": m.get("label"),
            "provider": m.get("provider"),
            "free": bool(id_free or lbl_free),
            "success_count": t.get("success_count", 0),
            "failure_count": t.get("failure_count", 0),
            "consecutive_failures": t.get("consecutive_failures", 0),
            "last_used": t.get("last_used"),
            "last_failure": t.get("last_failure"),
        })
    # 2) modelos con tracking que no estén en el catálogo
    seen = {o["model"] for o in out}
    for key, val in tracking.items():
        mid = key.replace("::", "/")
        if mid in seen:
            continue
        out.append({
            "model": mid, "label": mid, "provider": None,
            "free": "free" in mid.lower(),
            "success_count": val.get("success_count", 0),
            "failure_count": val.get("failure_count", 0),
            "consecutive_failures": val.get("consecutive_failures", 0),
            "last_used": val.get("last_used"),
            "last_failure": val.get("last_failure"),
        })
    # ordenar: con uso primero (por last_used), luego el resto; y marcar free
    out.sort(key=lambda x: (x["last_used"] is None, -(x["last_used"] or 0)))
    return out


@api_view(['GET'])
def dashboard_stats(request):
    """Estadísticas para el dashboard — datos reales del host + Hermes + negocio."""
    import psutil

    # 1) METRICAS DEL HOST (recolector externo, ver system_metrics.py)
    host_metrics = _host_metrics()
    # 2) ESTADO GATEWAY HERMES
    gateway = _gateway_state()
    # 3) TUNEL / DOMINIOS
    domains = (host_metrics or {}).get("domains", []) or []
    domains_summary = _domains_summary(domains)
    # 4) NEGOCIO (DB)
    business = _business_stats()
    # 5) RATE LIMITS REALES (tracking + catálogo)
    rate_limits = _model_rate_limits()

    # fallback si el recolector no corrió aún: usar psutil del contenedor
    if host_metrics is None:
        try:
            container_cpu = psutil.cpu_percent()
        except Exception:
            container_cpu = None
        try:
            container_ram = psutil.virtual_memory().percent
        except Exception:
            container_ram = None
    else:
        container_cpu = None
        container_ram = None

    # Alertas activas derivadas
    alerts = []
    hm = host_metrics or {}
    h = hm.get("host") or {}
    if h.get("disk", {}).get("percent") is not None and h["disk"]["percent"] >= 80:
        alerts.append({"level": "warning", "type": "disk",
                       "msg": f"Disco al {h['disk']['percent']}% (>80%)"})
    load = h.get("load") or []
    cores = h.get("cores") or 1
    if load and load[0] > cores * 1.5:
        alerts.append({"level": "warning", "type": "load",
                       "msg": f"Load alto: {load[0]} ({cores} cores)"})
    gw_state = gateway.get("gateway_state")
    if gw_state and gw_state != "running":
        alerts.append({"level": "warning", "type": "gateway",
                       "msg": f"Gateway Hermes en estado {gw_state}"})
    if domains_summary.get("unreachable", 0) > 0:
        alerts.append({"level": "warning", "type": "tunnel",
                       "msg": f"{domains_summary['unreachable']} dominio(s) inalcanzables"})

    return Response({
        "ts": hm.get("ts") or timezone.now().isoformat(),
        "host": h,
        "containers": (hm or {}).get("containers") or [],
        "domains": domains,
        "domains_summary": domains_summary,
        "gateway": {
            "state": gw_state,
            "platforms": list((gateway.get("platforms") or {}).keys()),
            "active_agents": gateway.get("active_agents"),
            "restart_requested": gateway.get("restart_requested"),
        },
        "rateLimits": rate_limits,
        "business": business,
        "alerts": alerts,
        "container_probe": {"cpu": container_cpu, "ram": container_ram},
        "source": "hermes-host",
    })


@api_view(['GET'])
def agents_status(request):
    """Estado de sub-agentes"""
    agents = AgentTask.objects.all().order_by('-created_at')
    data = [{'id': a.id, 'name': a.name, 'type': a.agent_type, 'status': a.status} for a in agents]
    return Response(data)


@api_view(['POST'])
def update_lead_status(request, lead_id):
    """Actualizar estado de un lead"""
    try:
        lead = Lead.objects.get(id=lead_id)
        new_status = request.data.get('status')
        if new_status in ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']:
            lead.status = new_status
            lead.save()
            return Response({'status': 'ok'})
        return Response({'error': 'Invalid status'}, status=400)
    except Lead.DoesNotExist:
        return Response({'error': 'Lead not found'}, status=404)


@api_view(['GET'])
def chats_list(request):
    """Lista de conversaciones"""
    chats = Conversation.objects.all().order_by('-created_at')
    data = [{'id': c.id, 'title': c.title, 'created_at': str(c.created_at)} for c in chats]
    return Response(data)


@api_view(['GET'])
def leads_list(request):
    """Lista de leads"""
    leads = Lead.objects.all().order_by('-created_at')
    data = [{'id': l.id, 'name': l.name, 'email': l.email, 'status': l.status} for l in leads]
    return Response(data)


@api_view(['GET'])
def posts_list(request):
    """Lista de posts"""
    posts = Post.objects.all().order_by('-created_at')
    data = [{'id': p.id, 'title': p.title, 'status': p.status} for p in posts]
    return Response(data)


@api_view(['GET'])
def scheduled_list(request):
    """Lista de posts programados"""
    scheduled = ScheduledPost.objects.all().order_by('-created_at')
    data = [{'id': s.id, 'title': s.title, 'scheduled_at': str(s.scheduled_at)} for s in scheduled]
    return Response(data)


@api_view(['GET'])
def agents_list(request):
    """Lista de agentes"""
    agents = AgentTask.objects.all().order_by('-created_at')
    data = [{'id': a.id, 'name': a.name, 'type': a.agent_type, 'status': a.status} for a in agents]
    return Response(data)


# ===== Conversaciones del CRM (nuevo chat, renombrar, retomar) =====

@api_view(['GET', 'POST'])
def crm_conversations(request):
    """Lista o crea conversaciones del CRM (sesiones del panel)."""
    if request.method == 'GET':
        convos = Conversation.objects.filter(user=request.user).order_by('-pinned', '-updated_at')
        data = [{
            'id': c.id,
            'title': c.title or 'Nueva conversación',
            'created_at': c.created_at.isoformat() if c.created_at else None,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            'model': c.model_config.name if c.model_config else '',
            'pinned': c.pinned,
            'message_count': c.messages.count(),
            'preview': (c.messages.order_by('-created_at').first().content[:80]
                        if c.messages.first() else ''),
        } for c in convos]
        return Response({'ok': True, 'conversations': data})

    # POST: crear nueva conversación (sesión nueva)
    serializer = ConversationSerializer(data={
        'user': request.user.id,
        'title': request.data.get('title') or None,
    })
    if serializer.is_valid():
        c = serializer.save()
        return Response({'ok': True, 'conversation': {
            'id': c.id,
            'title': c.title or 'Nueva conversación',
            'created_at': c.created_at.isoformat() if c.created_at else None,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            'model': '',
            'message_count': 0,
            'preview': '',
        }}, status=201)
    return Response({'ok': False, 'errors': serializer.errors}, status=400)


@api_view(['GET', 'PATCH', 'DELETE'])
def crm_conversation_detail(request, pk):
    """Retoma (GET), renombra/fija (PATCH) o elimina (DELETE) una conversación del CRM."""
    try:
        c = Conversation.objects.get(pk=pk, user=request.user)
    except Conversation.DoesNotExist:
        return Response({'ok': False, 'error': 'Conversación no encontrada'}, status=404)

    # DELETE: eliminar conversación + mensajes
    if request.method == 'DELETE':
        c.delete()
        return Response({'ok': True, 'deleted': pk})

    if request.method == 'GET':
        msgs = c.messages.order_by('created_at')
        return Response({
            'ok': True,
            'conversation': {
                'id': c.id,
                'title': c.title or 'Nueva conversación',
                'model': c.model_config.name if c.model_config else '',
                'message_count': msgs.count(),
            },
            'messages': [{
                'role': m.role,
                'content': m.content,
                'artifacts': m.artifacts or [],
                'created_at': m.created_at.isoformat() if m.created_at else None,
            } for m in msgs],
        })

    # PATCH: renombrar o fijar/desfijar
    title = request.data.get('title')
    if title is not None:
        c.title = str(title).strip()
        c.save()
    if 'pinned' in request.data:
        c.pinned = bool(request.data['pinned'])
        c.save()
    return Response({'ok': True, 'title': c.title, 'pinned': c.pinned})


@api_view(['POST'])
def crm_conversation_model(request, pk):
    """Cambia el modelo de la sesión de agente de esta conversación al instante
    (session model lock) — la misma conversación sigue con el modelo nuevo desde
    el próximo mensaje, sin crear sesión nueva ni perder el historial."""
    try:
        c = Conversation.objects.get(pk=pk, user=request.user)
    except Conversation.DoesNotExist:
        return Response({'ok': False, 'error': 'Conversación no encontrada'}, status=404)
    new_model = (request.data.get('model') or '').strip()
    if not new_model or new_model == 'hermes-agent':
        new_model = 'deepseek/deepseek-v4-flash'
    stored = (c.memory or '')
    if not stored.startswith('hermes_session:'):
        # no hay sesión aún -> solo registrar el modelo para cuando se cree
        from .models import ModelConfig
        cfg, _ = ModelConfig.objects.get_or_create(name=new_model, defaults={
            'provider': 'commandcode', 'model_id': new_model})
        c.model_config = cfg
        c.save()
        return Response({'ok': True, 'model': new_model, 'locked': False,
                         'msg': 'Modelo guardado para la próxima sesión'})
    session_id = stored.split(':', 1)[1].strip()
    ok = _lock_agent_session_model(request.user, session_id, new_model)
    from .models import ModelConfig
    cfg, _ = ModelConfig.objects.get_or_create(name=new_model, defaults={
        'provider': 'commandcode', 'model_id': new_model})
    c.model_config = cfg
    c.save()
    return Response({'ok': True, 'model': new_model, 'locked': ok,
                     'msg': 'Modelo cambiado en la sesión' if ok else 'el lock no se pudo aplicar (el próximo mensaje igual lo usará)'})


@api_view(['POST'])
def crm_conversation_message(request, pk):
    """Agrega un mensaje a una conversación del CRM. Si es del usuario, consulta el
    proxy Hermes y guarda la respuesta del asistente (chat bidireccional)."""
    try:
        c = Conversation.objects.get(pk=pk, user=request.user)
    except Conversation.DoesNotExist:
        return Response({'ok': False, 'error': 'Conversación no encontrada'}, status=404)
    role = request.data.get('role', 'user')
    content = request.data.get('content')
    if not content:
        return Response({'ok': False, 'error': 'content requerido'}, status=400)
    m = Message.objects.create(conversation=c, role=role, content=content)
    c.save()  # actualizar updated_at

    response_data = {'ok': True, 'message': {
        'role': m.role, 'content': m.content,
        'created_at': m.created_at.isoformat() if m.created_at else None,
    }}

    # Si es un mensaje de usuario, lanzar el agente Hermes en BACKGROUND (no bloquear).
    # El frontend hace polling y descubre la respuesta cuando el agente termina.
    if role in ('user', 'human'):
        model = request.data.get('model') or None
        response_data['agent_pending'] = True
        response_data['agent_poll_path'] = f'/api/chat/conversations/{pk}/'
        import threading
        t = threading.Thread(
            target=_run_agent_background,
            args=(request.user.id, pk, content, model),
            daemon=True,
        )
        t.start()
        response_data['agent_started'] = True

    return Response(response_data, status=201)


def _extract_artifacts(content):
    """Separa bloques ```artifact:<type> ... ``` del texto y los devuelve como
    lista de artefactos tipo Claude. Acepta content str o dict {content: str}.
    Retorna (texto_limpio, [artefactos]).
    Tipos soportados: code, mermaid, markdown, txt. Extra: lang/title."""
    import re
    if isinstance(content, dict):
        content = content.get('content') or content.get('message', '') or ''
    if not isinstance(content, str) or not content:
        return (content, [])
    pattern = re.compile(
        r'```\s*artifact:([a-zA-Z0-9_+-]+)\s*([^\n]*)\n(.*?)```',
        re.DOTALL | re.IGNORECASE,
    )
    artifacts = []
    out_text = content
    for m in pattern.finditer(content):
        atype = m.group(1).strip().lower()
        meta = m.group(2).strip() if m.group(2) else ''
        body = m.group(3)
        if atype not in ('code', 'mermaid', 'markdown', 'md', 'txt', 'text', 'html', 'svg',
                         'file', 'plain', 'plaintext'):
            # no es artefacto conocido -> dejar el bloque como texto
            continue
        title = ''
        lang = None
        # parsear lang="xx" y title="yy" opcionales
        import shlex
        try:
            parts = shlex.split(meta)
        except Exception:
            parts = meta.split()
        for p in parts:
            if '=' in p:
                k, v = p.split('=', 1)
                v = v.strip('"\'')
                if k == 'lang':
                    lang = v
                elif k == 'title':
                    title = v
        if atype == 'md':
            atype = 'markdown'
        elif atype in ('text', 'file', 'plain', 'plaintext'):
            atype = 'txt'
        if not title:
            title = {'code': 'Código', 'mermaid': 'Diagrama', 'markdown': 'Markdown',
                     'txt': 'Texto', 'html': 'HTML', 'svg': 'SVG'}.get(atype, 'Artefacto')
        artifacts.append({
            'type': atype,
            'title': title,
            'lang': lang,
            'content': body,
        })
        # quitar el bloque del texto visible
        out_text = out_text.replace(m.group(0), '', 1)
    # limpiar espacios residuales del texto
    if artifacts:
        out_text = re.sub(r'\n{3,}', '\n\n', out_text).strip()
    return (out_text, artifacts)


def _run_agent_background(user_id, conversation_pk, user_content, requested_model):
    """Ejecuta el turno del agente Hermes en un hilo. Guarda la respuesta del
    assistant en la conversación cuando termina."""
    # Si el mensaje lleva imagen (user_content es lista multimodal), la sesión debe
    # usar el modelo VISION para leerla (deepseek-v4-flash-vision-exp).
    vision_model = 'deepseek/deepseek-v4-flash-vision-exp'
    if isinstance(user_content, list):
        requested_model = vision_model
    try:
        asst = _ask_hermes(user_id, conversation_pk, user_content, requested_model)
    except Exception:
        asst = None
    try:
        c = Conversation.objects.filter(pk=conversation_pk).first()
        if c and asst:
            clean_text, artifacts = _extract_artifacts(asst)
            artifacts = artifacts or []
            # Si el agente generó una carpeta de proyecto, agregar artefacto zip
            if _has_project_files(c.id):
                if not any(a.get('type') == 'zip' for a in artifacts):
                    artifacts.append({
                        'type': 'zip',
                        'title': 'Proyecto.zip',
                        'lang': None,
                        'content': '',
                        'url': f'/api/chat/hermes/project_zip/{c.id}/',
                        'file_count': _project_file_count(c.id),
                    })
            Message.objects.create(
                conversation=c, role='assistant', content=clean_text,
                artifacts=artifacts or None)
            c.save()
    except Exception:
        pass
    finally:
        try:
            from django.db import connections
            connections.close_all()
        except Exception:
            pass


def _ask_hermes(user_id, conversation_pk, user_content, requested_model=None):
    """Ejecuta un turno del agente Hermes real via el api_server del gateway
    (POST /api/sessions/{id}/chat, no-stream). Thread-safe: recibe user_id, no request."""
    if not GATEWAY_CHAT_URL:
        return _ask_proxy_nous(user_id, conversation_pk, user_content, requested_model)

    key = _read_gateway_key()
    if not key:
        return _ask_proxy_nous(user_id, conversation_pk, user_content, requested_model)

    # Modelo: el del selector; si viene empty o 'hermes-agent' (que resuelve mal),
    # usar el default de Command Code (deepseek v4 flash, el mas estable del provider
    # activo). NO longcat en lowercase via command code — daba 524 upstream.
    model = (requested_model or '').strip()
    if not model or model == 'hermes-agent':
        model = 'deepseek/deepseek-v4-flash'

    try:
        from django.contrib.auth.models import User
        convo = Conversation.objects.filter(pk=conversation_pk).first()
        user = User.objects.filter(pk=user_id).first()
        if not convo or not user:
            return None

        # 1) Obtener/crear la sesión de agente Hermes mapeada a esta conversación.
        agent_session_id = _get_agent_session_id(user, convo, model)

        # 2) Enviar el turno al gateway (no-stream, respuesta JSON). Sin fijar modelo:
        #    el agente usa su default/global (deepseek fireworks / router menos-usado),
        #    que responde en segundos. Fijar modelo explícito cae en la cadena de
        #    fallbacks y no termina.
        import urllib.request
        import urllib.error
        data = {
            "message": user_content,  # el endpoint espera string, no dict {role,content}
            "system_message": _crm_system_prompt(conversation_pk),
        }
        body = json.dumps(data).encode()
        req = urllib.request.Request(
            f"{GATEWAY_CHAT_URL.format(agent_session_id)}", data=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                     "X-Hermes-Session-Id": agent_session_id, "User-Agent": "crm-bot"})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                data = json.load(r)
        except urllib.error.HTTPError as e:
            # si la sesión no existe, recrearla una vez
            if e.code == 404:
                agent_session_id = _create_agent_session_sub(user, convo.id, model)
                if agent_session_id:
                    convo.memory = f"hermes_session:{agent_session_id}"
                    convo.save()
                    data = {
                        "model": model,
                        "message": user_content,
                        "system_message": _crm_system_prompt(conversation_pk),
                    }
                    body = json.dumps(data).encode()
                    req = urllib.request.Request(
                        f"{GATEWAY_CHAT_URL.format(agent_session_id)}", data=body,
                        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                                 "X-Hermes-Session-Id": agent_session_id, "User-Agent": "crm-bot"})
                    with urllib.request.urlopen(req, timeout=600) as r2:
                        data = json.load(r2)
                else:
                    return _ask_proxy_nous(user_id, conversation_pk, user_content, requested_model)
            else:
                return _ask_proxy_nous(user_id, conversation_pk, user_content, requested_model)

        content = (data.get("message") or {}).get("content")
        return (content or "").strip() or None
    except Exception:
        return _ask_proxy_nous(user_id, conversation_pk, user_content, requested_model)


def _crm_system_prompt(conversation_pk):
    """System prompt dinámico del chat CRM. Incluye la carpeta de salida para
    varios archivos (que el backend zipea y entrega como .zip)."""
    import os
    out_dir = _crm_output_dir(conversation_pk)  # ej. /root/.hermes/crm_output/17
    return (
        "Sos el asistente de IA del CRM MyAgenteIA. Respondé con claridad y en el "
        "idioma que se te habla. Si el usuario pide acciones técnicas podes razonar y "
        "proponer, pero sin ejecutar comandos destructivos sin confirmación.\n\n"
        "FORMA DE ENTREGAR ARCHIVOS O ARTEFACTOS (IMPORTANTE):\n"
        "Cuando el usuario pida algo que sea código, un diagrama, documentación markdown "
        "o un archivo de texto, NO lo pongas suelto en el texto: separarlo en un BLOQUE "
        "fenced con el prefijo artifact:<tipo>. El sistema lo detecta y lo muestra como "
        "una tarjeta descargable/copiable al lado del chat. Formatos exactos:\n"
        "  Código: ```artifact:code lang=\"python\" title=\"mi_script.py\"\\n<el codigo>```\n"
        "  Diagrama: ```artifact:mermaid\\n<diagrama mermaid valido>```\n"
        "  Documento markdown: ```artifact:markdown title=\"notas.md\"\\n<contenido .md>```\n"
        "  Texto plano: ```artifact:txt\\n<contenido>```\n"
        "Siempre cerrar el código sin artefactos en el texto visible, solo breve "
        "explicación.\n\n"
        "PROYECTOS MULTI-ARCHIVO (CARPETA + ZIP):\n"
        "Si el usuario pide VARIOS archivos o un proyecto completo (una app, un sitio, "
        "módulos, scripts+docs): NO los pongas sueltos en el texto. Creales la carpeta "
        f"{out_dir} (mkdir -p) y guardá TODOS los archivos ahí. Después respondé en texto "
        "breve describiendo qué guardaste y decile al usuario que puede descargar todo "
        "como .zip. El sistema zipeará esa carpeta automáticamente al final del turno.\n\n"
        "Al crear un artefacto de código: encerrar entre ```artifact:code ... ``` el código "
        "completo (funcionando y sin truncar), y SIEMPRE pedirle al usuario si quiere que se "
        "lo adapte o explique."
    )


def _crm_output_dir(conversation_pk):
    """Carpeta de salida multi-archivo de una conversación.

    El agente Hermes (corre en el host, root) escribe en /root/.hermes/crm_output/<pk>.
    El backend lo ve montado como /hermes/crm_output/<pk> (volumen read-only). Para
    listar/comprimir usamos el path de lectura; el agente usa el path host real.
    """
    return os.path.join(os.environ.get('CRM_OUTPUT_DIR', '/root/.hermes/crm_output'), str(conversation_pk))


def _crm_output_dir_read(conversation_pk):
    """Path de lectura (dentro del contenedor backend) de la carpeta de salida."""
    reads = os.environ.get('CRM_OUTPUT_DIR_READ', '/hermes/crm_output')
    return os.path.join(reads, str(conversation_pk))


def _has_project_files(conversation_pk):
    """¿La conversación generó la carpeta de proyecto con al menos un archivo?"""
    try:
        d = _crm_output_dir_read(conversation_pk)
        if not os.path.isdir(d):
            return False
        files = [f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]
        return len(files) > 0
    except Exception:
        return False


def _project_file_count(conversation_pk):
    try:
        d = _crm_output_dir_read(conversation_pk)
        return len([f for f in os.listdir(d) if os.path.isfile(os.path.join(d, f))]) if os.path.isdir(d) else 0
    except Exception:
        return 0


def _get_agent_session_id(user, convo, model):
    """Reusa la sesión de agente Hermes de esta conversación o la crea.
    session id UNICO por conversación (no hash compartido) para evitar
    colisiones de turnos simultáneos en el api_server."""
    stored = (convo.memory or "")
    if stored.startswith("hermes_session:"):
        return stored.split(":", 1)[1].strip()
    sid = _create_agent_session_sub(user, convo.id, model)
    if sid:
        convo.memory = f"hermes_session:{sid}"
        convo.save()
    return sid


def _lock_agent_session_model(user, session_id, model):
    """Fija el modelo de la sesión del agente (session model lock) para que el agente
    USE ese modelo sin caer en la cadena de fallbacks. Es el equivalente de /model
    aplicado a la sesión — 'que el selector setee el modelo', como pediste."""
    import urllib.request
    import urllib.error
    key = _read_gateway_key()
    if not key or not GATEWAY_LOCK_URL:
        return False
    lock_model = model if model and model != 'hermes-agent' else 'deepseek/deepseek-v4-flash'
    # derivar provider desde el id (commandcode, nous, openrouter, etc)
    def _derive_provider(m):
        # modelos de Command Code: deepseek/, gpt-, google/, Qwen/, z-ai/, zai-org/, MiniMaxAI/, claude-...
        cc_prefixes = ('deepseek/', 'gpt-', 'google/', 'Qwen/', 'z-ai/', 'zai-org/', 'MiniMaxAI/', 'moonshotai/', 'claude-', 'stepfun/', 'tencent/', 'xiaomi/', 'sakana/', 'nvidia/', 'thinkingmachines/', 'poolside/', 'meta/', 'xai/', 'meituan/')
        if m.startswith(cc_prefixes):
            return 'commandcode'
        if '/' in m:
            return m.split("/")[0]
        return 'commandcode'
    provider = _derive_provider(lock_model)
    body = json.dumps({
        "model": lock_model,
        "provider": provider,
    }).encode()
    req = urllib.request.Request(
        GATEWAY_LOCK_URL.format(session_id), data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "User-Agent": "crm-bot"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return True
    except urllib.error.HTTPError as e:
        if e.code in (200, 201):
            return True
        return False
    except Exception:
        return False


def _create_agent_session_sub(user, conversation_id, model):
    """POST /api/sessions — crea una sesión de agente Hermes UNICA por conversación."""
    import urllib.request
    import urllib.error
    key = _read_gateway_key()
    if not key or not GATEWAY_SESSIONS_URL:
        return None
    # modelo a usar: nunca 'hermes-agent' (resuelve mal), siempre uno concreto
    create_model = model if model and model != 'hermes-agent' else 'deepseek/deepseek-v4-flash'
    sid = f"crm_{conversation_id}_{uuid_hex8()}"
    body = json.dumps({
        "id": sid, "model": create_model,
        "source": "api_server",
    }).encode()
    req = urllib.request.Request(GATEWAY_SESSIONS_URL, data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                 "User-Agent": "crm-bot"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
            created_id = data.get("session", {}).get("id") or data.get("id") or sid
            return created_id
    except urllib.error.HTTPError as e:
        # 201/200 confirman creada; "exists" también es válido (reusamos)
        if e.code in (200, 201):
            return sid
        return None
    except Exception:
        return None


def _read_gateway_key():
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


def _build_history(conversation_pk, user_content):
    convo = Conversation.objects.filter(pk=conversation_pk).first()
    history = []
    if convo:
        for mm in convo.messages.order_by('created_at')[:12]:
            if mm.role in ('user', 'assistant'):
                entry = {'role': mm.role, 'content': mm.content}
                if mm.attachments:
                    entry['attachments'] = mm.attachments
                history.append(entry)
    if not history or history[-1]['role'] != 'user':
        history.append({'role': 'user', 'content': user_content})
    return history or [{'role': 'user', 'content': user_content}]


def _ask_proxy_nous(user_id, conversation_pk, user_content, requested_model=None):
    """Fallback: consulta el proxy Nous local (OpenAI client). Thread-safe."""
    from openai import OpenAI
    proxy_url = os.environ.get('HERMES_PROXY_URL', '').rstrip('/')
    default_model = os.environ.get('HERMES_PROXY_MODEL', 'meituan/longcat-2.0:free')
    model = requested_model if requested_model else default_model
    if not proxy_url:
        return None
    reasoning_models = ('laguna', 'ling', 'step')
    max_tokens = 1600 if any(k in model for k in reasoning_models) else 800
    try:
        history = _build_history(conversation_pk, user_content)
        client = OpenAI(base_url=proxy_url, api_key='dummy', timeout=120.0, max_retries=0)
        resp = client.chat.completions.create(model=model, messages=history, max_tokens=max_tokens)
        content = resp.choices[0].message.content
        if not content and getattr(resp.choices[0].message, 'reasoning', None):
            content = resp.choices[0].message.reasoning[-2000:]
        return content
    except Exception:
        return None


# ---- Multimedia: preparación de contenido y upload ----

def _prepare_user_content(message):
    """Convierte un Message (texto + attachments) en el input que el agente procesa.
    Devuelve un string, o una lista de partes OpenAI-style (texto + imagen data URL)
    cuando hay imágenes adjuntas y la sesión es vision-capable. Audio/documentos se
    convierten a texto (transcripción/extracción); imágenes NO se hacen OCR local sino
    que se pasan al modelo vision."""
    parts = []
    image_parts = []
    has_image = False
    if message.content:
        parts.append(message.content)
    for att in (message.attachments or []):
        att_type = att.get('type', '')
        att_name = att.get('name', 'archivo')
        att_url = att.get('url', '')
        if att_url.startswith('/media/'):
            file_path = os.path.join(settings.MEDIA_ROOT, att_url[len('/media/'):])
        else:
            file_path = att_url
        if att_type == 'audio':
            from chat.extractors import transcribe_audio
            transcription = transcribe_audio(file_path)
            parts.append(f"[Nota de voz transcrita]: {transcription}" if transcription else f"[Nota de voz: {att_name}]")
        elif att_type == 'document':
            from chat.extractors import extract_document_text
            text = extract_document_text(file_path, att.get('mime', ''))
            parts.append(f"[Documento: {att_name}]\n{text}" if text else f"[Documento: {att_name}]")
        elif att_type == 'image':
            has_image = True
            # pasar imagen al modelo vision como data URL (el OCR lo hace el modelo)
            image_parts.append(image_to_data_url(file_path))
    text_content = "\n\n".join(parts)
    if has_image and image_parts:
        content = [{"type": "text", "text": text_content or "Mirá esta imagen"}]
        for iu in image_parts:
            content.append({"type": "image_url", "image_url": {"url": iu}})
        return content
    return text_content


def image_to_data_url(file_path):
    """Convierte una imagen a data URL base64 para pasarla al modelo vision."""
    import base64
    ext = os.path.splitext(file_path)[1].lower().lstrip('.') or 'png'
    mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'webp': 'webp', 'gif': 'gif',
            'bmp': 'bmp', 'svg': 'svg'}.get(ext, ext)
    try:
        with open(file_path, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode()
        return f"data:image/{mime};base64,{b64}"
    except Exception:
        return ''


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def crm_conversation_upload(request, pk):
    """Sube archivos (audio/documento/imagen) y crea el mensaje del usuario."""
    try:
        c = Conversation.objects.get(pk=pk, user=request.user)
    except Conversation.DoesNotExist:
        return Response({'ok': False, 'error': 'Conversación no encontrada'}, status=404)
    files = request.FILES.getlist('files')
    content = request.data.get('content', '')
    attachment_type = request.data.get('type', 'document')
    if not files and not content:
        return Response({'ok': False, 'error': 'Enviá un archivo o un mensaje'}, status=400)
    attachments = []
    for f in files:
        mime = f.content_type or 'application/octet-stream'
        folder = os.path.join(settings.MEDIA_ROOT, f'{attachment_type}s', str(pk))
        os.makedirs(folder, exist_ok=True)
        ts = int(timezone.now().timestamp())
        safe_name = f"{ts}_{f.name}"
        file_path = os.path.join(folder, safe_name)
        with open(file_path, 'wb') as dest:
            for chunk in f.chunks():
                dest.write(chunk)
        thumb_url = None
        if attachment_type == 'image' and mime.startswith('image/'):
            from chat.extractors import generate_image_thumbnail
            thumb_path = generate_image_thumbnail(file_path)
            if thumb_path:
                thumb_url = f"/media/images/{pk}/{os.path.basename(thumb_path)}"
        att = {'type': attachment_type, 'url': f"/media/{attachment_type}s/{pk}/{safe_name}",
               'name': f.name, 'size': f.size, 'mime': mime}
        if thumb_url:
            att['thumbnail'] = thumb_url
        if attachment_type == 'audio':
            att['duration'] = request.data.get('duration', None)
        attachments.append(att)
    m = Message.objects.create(conversation=c, role='user', content=content,
                               attachments=attachments if attachments else None)
    c.save()
    response_data = {'ok': True, 'message': {
        'role': m.role, 'content': m.content, 'attachments': m.attachments or [],
        'created_at': m.created_at.isoformat() if m.created_at else None,
    }}
    if attachments or content:
        model = request.data.get('model') or None
        response_data['agent_pending'] = True
        response_data['agent_poll_path'] = f'/api/chat/conversations/{pk}/'
        import threading
        t = threading.Thread(target=_run_agent_background,
                             args=(request.user.id, pk, _prepare_user_content(m), model))
        t.daemon = True
        t.start()
    return Response(response_data, status=201)
