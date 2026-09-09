"""Agentes: observabilidad + disparo de tareas + persistencia (Nivel 1-3).

Lee los sub-agentes REALES de Hermes (/hermes/cache/delegation/live/*) que el
contenedor ve montado desde /root/.hermes, y el gateway api_server (sesiones).
"""
import os
import json
import glob
import re
import urllib.request
import threading
from datetime import datetime, timedelta

from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.utils import timezone
from django.conf import settings

from .models import AgentTask, AgentLog

# /hermes = /root/.hermes (volumen read-only en el contenedor)
HERMES_ROOT = getattr(settings, 'HERMES_ROOT', '/hermes')
DELEG_LIVE = os.path.join(HERMES_ROOT, 'cache', 'delegation', 'live')

# gateway api_server
_GW = os.environ.get('HERMES_GATEWAY_URL', '').rstrip('/')  # http://10.0.3.1:8642/v1
if _GW.endswith('/v1'):
    _GW = _GW[:-3]


def _read_gateway_key():
    """API_SERVER_KEY del .env de Hermes, montado como /hermes/.env."""
    try:
        with open(os.path.join(HERMES_ROOT, '.env')) as f:
            for line in f:
                if line.startswith('API_SERVER_KEY='):
                    return line.split('=', 1)[1].strip().strip('"')
    except Exception:
        pass
    return None


def _gw_request(method, path, payload=None, timeout=30):
    key = _read_gateway_key()
    if not key or not _GW:
        return None
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{_GW}{path}", data=body, method=method,
                                 headers={"Authorization": f"Bearer {key}",
                                          "Content-Type": "application/json",
                                          "User-Agent": "crm-bot"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except Exception:
        return None


# ---------------- Nivel 1: Observabilidad de sub-agentes vivos ----------------

def _parse_transcript(log_path, max_lines=40):
    """Lee el task-0.log (append-only) y devuelve las últimas líneas legibles,
    separando rol (assistant/think/tool/final) y timestamp."""
    lines = []
    try:
        if not os.path.exists(log_path):
            return lines, 'no log'
        with open(log_path, 'r', errors='ignore') as f:
            raw = f.read().splitlines()
        # saltar cabecera
        for line in raw:
            m = re.match(r'^(\d{2}:\d{2}:\d{2})\s+(\w+)\s*\|\s*(.*)$', line)
            if m:
                lines.append({'time': m.group(1), 'role': m.group(2), 'text': m.group(3)[:400]})
    except Exception:
        pass
    return lines[-max_lines:], None


def _subagent_dir_status(d):
    """Estado de un subagente desde su manifest.json + log."""
    manifest_path = os.path.join(d, 'manifest.json')
    log_path = os.path.join(d, 'task-0.log')
    if not os.path.exists(manifest_path):
        return None
    try:
        with open(manifest_path) as f:
            manifest = json.load(f)
    except Exception:
        return None
    sid = os.path.basename(d)
    tasks = manifest.get('tasks', [])
    # status agregado: si todos completed -> completed; si hay failed -> failed
    statuses = [t.get('status', 'unknown') for t in tasks]
    if any(s == 'failed' for s in statuses):
        status = 'failed'
    elif all(s == 'completed' for s in statuses):
        status = 'completed'
    elif any(s in ('running', 'pending') for s in statuses):
        status = 'running'
    else:
        status = 'unknown'
    transcript, err = _parse_transcript(log_path)
    # últimas líneas de contenido
    last_text = ''
    for l in reversed(transcript):
        if l['role'] not in ('final',):
            last_text = l['text']
            break
    return {
        'id': sid,
        'model': manifest.get('model', ''),
        'provider': manifest.get('provider', ''),
        'started': manifest.get('started', ''),
        'completed': manifest.get('completed', ''),
        'status': status,
        'task_count': manifest.get('task_count', len(tasks)),
        'tasks': [{'index': t.get('index'), 'status': t.get('status'),
                   'goal': (t.get('goal') or '')[:160]} for t in tasks],
        'transcript': transcript,
        'last_text': last_text,
    }


@api_view(['GET'])
def agents_live(request):
    """Lista los sub-agentes REALES en /hermes/cache/delegation/live, más vivos."""
    agents = []
    if os.path.isdir(DELEG_LIVE):
        for d in sorted(glob.glob(os.path.join(DELEG_LIVE, 'deleg_*'))):
            a = _subagent_dir_status(d)
            if a:
                agents.append(a)
    # ordenar: running primero, después por started desc
    agents.sort(key=lambda x: (x['status'] != 'running', x['started'] or ''), reverse=False)
    return Response({'ok': True, 'count': len(agents), 'agents': agents})


@api_view(['GET'])
def agents_live_detail(request, delegation_id):
    """Detalle de un subagente específico (transcript completo)."""
    d = os.path.join(DELEG_LIVE, delegation_id)
    if not os.path.isdir(d):
        return Response({'ok': False, 'error': 'no encontrado'}, status=404)
    a = _subagent_dir_status(d)
    # por defecto transcript se trunca a 40; acá pedimos más
    log_path = os.path.join(d, 'task-0.log')
    a['transcript_full'], _ = _parse_transcript(log_path, max_lines=200)
    return Response({'ok': True, 'agent': a})


# ---------------- Nivel 2: Disparar tareas reales ----------------

_GATEWAY_CHAT_URL = (_GW + '/api/sessions/{}/chat') if _GW else ''
_GATEWAY_LOCK_URL = (_GW + '/api/sessions/{}/model') if _GW else ''


def _run_agent_task(task_id):
    """Dispara la tarea en un sub-agente Hermes real: crea una sesión de agente
    dedicada en el gateway y le manda la tarea. Actualiza AgentTask al terminar."""
    import time as _t
    try:
        task = AgentTask.objects.get(pk=task_id)
    except AgentTask.DoesNotExist:
        return
    goal = (task.input_data or {}).get('goal', '')
    model = (task.input_data or {}).get('model') or ''
    if not goal:
        task.status = 'failed'
        task.completed_at = timezone.now()
        task.save()
        return
    try:
        from chat.views import _read_gateway_key
        key = _read_gateway_key()
        # crear sesión de agente dedicada
        data = _gw_request('POST', '/api/sessions', {'title': f'AgentTask {task_id}'})
        session_id = None
        if data:
            session_id = data.get('session_id') or data.get('id') or (data.get('session') or {}).get('id')
            if callable(session_id):
                session_id = None
        if not session_id:
            task.status = 'failed'
            task.completed_at = timezone.now()
            task.save()
            return
        # fijar modelo si viene
        if model and _GW:
            _gw_request('POST', f'/api/sessions/{session_id}/model', {'model': model, 'provider': 'commandcode'})
        # enviar la tarea (timeout largo)
        body = json.dumps({'message': goal, 'system_message': 'Sos un sub-agente del CRM MyAgenteIA. Completá la tarea de forma autónoma y devolvé un resumen del resultado. No pidas confirmación salvo acciones destructivas.'}).encode()
        req = urllib.request.Request(
            f"{_GATEWAY_CHAT_URL.format(session_id)}", data=body,
            headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                     "X-Hermes-Session-Id": session_id, "User-Agent": "crm-bot"})
        with urllib.request.urlopen(req, timeout=1800) as r:
            result = json.load(r)
        content = (result.get("message") or {}).get("content") or ''
        task.output_data = {'summary': content[:2000], 'session_id': session_id}
        task.status = 'completed'
        task.completed_at = timezone.now()
        task.save()
        AgentLog.objects.create(agent_task=task, level='info', message=content[:500])
    except Exception as e:
        task.status = 'failed'
        task.completed_at = timezone.now()
        task.save()
        AgentLog.objects.create(agent_task=task, level='error', message=str(e)[:500])


@api_view(['GET'])
def agents_tasks(request):
    """Historial de tareas de agentes (persistidas en DB)."""
    qs = AgentTask.objects.order_by('-created_at')[:50]
    return Response({'ok': True, 'tasks': [{
        'id': t.id, 'name': t.name, 'agent_type': t.agent_type,
        'status': t.status, 'priority': t.priority,
        'created_at': t.created_at.isoformat(),
        'completed_at': t.completed_at.isoformat() if t.completed_at else None,
        'output_summary': (str(t.output_data.get('summary') or '')[:200] if t.output_data else ''),
    } for t in qs]})


@api_view(['POST'])
def agents_launch(request):
    """Dispara un sub-agente Hermes REAL: crea una sesión de agente dedicada y le
    envía la tarea. El resultado se guarda en AgentTask cuando termina."""
    name = (request.data.get('name') or 'Tarea de agente').strip()
    goal = (request.data.get('goal') or '').strip()
    agent_type = (request.data.get('agent_type') or 'custom').strip()
    model = (request.data.get('model') or '').strip()
    if not goal:
        return Response({'ok': False, 'error': 'goal requerido'}, status=400)

    task = AgentTask.objects.create(
        name=name, description=goal, agent_type=agent_type,
        status='running', priority='medium',
        created_by=request.user if request.user.is_authenticated else None,
        input_data={'goal': goal, 'model': model},
        started_at=timezone.now())
    # correr el sub-agente real en background
    t = threading.Thread(target=_run_agent_task, args=(task.id,), daemon=True)
    t.start()
    return Response({'ok': True, 'task_id': task.id, 'status': 'running'})


@api_view(['GET'])
def agents_task_detail(request, task_id):
    try:
        t = AgentTask.objects.get(pk=task_id)
    except AgentTask.DoesNotExist:
        return Response({'ok': False, 'error': 'no encontrado'}, status=404)
    logs = list(t.logs.order_by('timestamp').values('level', 'message', 'timestamp'))
    return Response({'ok': True, 'task': {
        'id': t.id, 'name': t.name, 'agent_type': t.agent_type,
        'status': t.status, 'priority': t.priority,
        'input_data': t.input_data, 'output_data': t.output_data,
        'created_at': t.created_at.isoformat(),
        'started_at': t.started_at.isoformat() if t.started_at else None,
        'completed_at': t.completed_at.isoformat() if t.completed_at else None,
    }, 'logs': logs})


# ---------------- Nivel 3: Sesiones persistentes (agentes vivos) ----------------

@api_view(['GET'])
def agents_sessions(request):
    """Lista las sesiones de agente PERSISTENTES del gateway (quedan vivas entre
    turnos, conservan historial/memoria). Son la base de 'agentes que no mueren'."""
    data = _gw_request('GET', '/api/sessions?limit=100')
    if data is None:
        return Response({'ok': False, 'error': 'gateway no disponible'}, status=503)
    sessions = data.get('data', data.get('sessions', data if isinstance(data, list) else []))
    return Response({'ok': True, 'count': len(sessions), 'sessions': sessions})


@api_view(['POST'])
def agents_session_spawn(request):
    """Crea una sesión de agente persistente (queda viva esperando tareas)."""
    title = (request.data.get('title') or 'Agente').strip()
    system = (request.data.get('system') or '').strip()
    model = (request.data.get('model') or '').strip()
    payload = {'title': title, 'system': system} if system else {'title': title}
    if model:
        payload['model'] = model
    data = _gw_request('POST', '/api/sessions', payload)
    if data is None:
        return Response({'ok': False, 'error': 'gateway no disponible'}, status=503)
    return Response({'ok': True, 'session': data})
