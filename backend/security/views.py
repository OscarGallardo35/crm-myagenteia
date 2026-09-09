"""Endpoints del apartado Seguridad: intentos de login, bloqueos, eventos SSH y acciones."""
import os
import re
import ipaddress
from datetime import datetime, timedelta

from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import LoginAttempt, IpBlock, SshEvent
from .ip_throttle import DEFAULT_THRESHOLD, _ip_key, count_recent_failures

# Se monta /var/log/:ro en el contenedor backend (docker-compose). Fallback: leer del path.
SSH_AUTH_LOG = os.environ.get('SSH_AUTH_LOG', '/var/log/auth.log')


# ---------------------------------------------------------------- utilidades
def _parse_auth_log(lines):
    """Parsea líneas de auth.log extrayendo eventos SSH de bruteforce."""
    events = []
    # '/var/log/auth.log:2026-09-07T...+02:00 host sshd[...]: Invalid user X from 1.2.3.4 port N'
    patterns = [
        (r'Invalid user\s+(\S+)\s+from\s+([0-9a-fA-F:.]+)', 'invalid_user'),
        (r'Failed password[^\n]*for\s+(\S+)\s+from\s+([0-9a-fA-F:.]+)', 'failed_password'),
        (r'Connection closed by invalid user\s+(\S+)\s+([0-9a-fA-F:.]+)', 'invalid_user'),
        (r'too many authentication failures for\s+(\S+)\s+from\s+([0-9a-fA-F:.]+)', 'many_failures'),
    ]
    for line in lines:
        l = line.strip()
        # timestamp ISO al inicio: 2026-09-07T18:41:29.771351+02:00 (o con prefijo path:)
        ts = None
        mts = re.match(r'^(?:[^:]*:\s*)?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})', l)
        if mts:
            try:
                ts = datetime.fromisoformat(mts.group(1).replace('T', ' '))
            except ValueError:
                ts = None
        for pat, etype in patterns:
            m = re.search(pat, l, re.IGNORECASE)
            if m:
                user = m.group(1)
                ip = m.group(2)
                try:
                    ipaddress.ip_address(ip)
                except ValueError:
                    continue
                events.append({'username': user, 'ip': ip, 'event_type': etype, 'raw_line': l, 'ts': ts})
                break
    return events


def _read_ssh_events(limit=None, since_hours=None):
    """Lee auth.log (o su rotado .1) y devuelve eventos SSH recientes."""
    if not os.path.exists(SSH_AUTH_LOG):
        return []
    paths = [SSH_AUTH_LOG]
    if os.path.exists(SSH_AUTH_LOG + '.1'):
        paths.append(SSH_AUTH_LOG + '.1')
    all_events = []
    for p in paths:
        try:
            with open(p, 'rb') as f:
                raw = f.read()
            text = raw.decode('utf-8', errors='ignore')
            all_events.extend(_parse_auth_log(text.splitlines()))
        except Exception:
            continue
    # dedupe por (ip, username, ts) aproximado sin perder orden
    seen = set()
    out = []
    for e in all_events:
        t = (e['ip'], e['username'], str(e['ts']))
        if t in seen:
            continue
        seen.add(t)
        out.append(e)
    out.sort(key=lambda x: x['ts'] or datetime.min, reverse=True)
    if since_hours:
        cutoff = timezone.now() - timedelta(hours=since_hours)
        out = [e for e in out
               if (e['ts'] and (e['ts'] if e['ts'].tzinfo else timezone.make_aware(e['ts'])) > cutoff)]
    if limit:
        out = out[:limit]
    return out


def _sync_ssh_blocks(events):
    """Para IPs con muchos eventos SSH recientes, crea IpBlock modo ssh."""
    now = timezone.now()
    counter = {}
    for e in events:
        counter.setdefault(e['ip'], 0)
        counter[e['ip']] += 1
    created = 0
    for ip, n in sorted(counter.items(), key=lambda x: -x[1]):
        if n >= 3:  # umbral SSH
            blk, was = IpBlock.objects.get_or_create(ip=_ip_key(ip), defaults={
                'status': IpBlock.STATUS_BLOCKED,
                'mode': IpBlock.MODE_SSH,
                'fail_count': n,
                'first_attempt_at': now,
                'last_attempt_at': now,
                'block_started_at': now,
            })
            if not was:
                continue
            blk.fail_count = n
            blk.notes = f"Detectado por {n} intentos SSH fallidos."
            blk.save()
            created += 1
    return created


# ---------------------------------------------------------------- endpoints
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def security_summary(request):
    """Métricas generales del apartado seguridad."""
    now = timezone.now()
    h1 = now - timedelta(hours=1)
    h24 = now - timedelta(hours=24)
    recent_fail = LoginAttempt.objects.filter(success=False, created_at__gte=h1).count()
    day_fail = LoginAttempt.objects.filter(success=False, created_at__gte=h24).count()
    blocked = IpBlock.objects.filter(status=IpBlock.STATUS_BLOCKED).count()
    active_ips_24h = len(set(
        LoginAttempt.objects.filter(created_at__gte=h24).values_list('ip', flat=True)))
    return Response({
        'ok': True,
        'threshold': DEFAULT_THRESHOLD,
        'login_attempts_1h': recent_fail,
        'login_attempts_24h': day_fail,
        'login_success_1h': LoginAttempt.objects.filter(success=True, created_at__gte=h1).count(),
        'blocked_ips': blocked,
        'unique_ips_24h': active_ips_24h,
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def security_attempts(request):
    """Intentos de login registrados (con geo de caché) — paginado liviano."""
    sl = int(request.query_params.get('limit', 100))
    sl = min(max(sl, 1), 500)
    since = request.query_params.get('since')  # h (horas) opcional
    qs = LoginAttempt.objects.all()
    if since:
        try:
            qs = qs.filter(created_at__gte=timezone.now() - timedelta(hours=int(since)))
        except ValueError:
            pass
    attempts = list(qs[:sl])
    # geo de las IPs única (caché si existe)
    from .geo import geo_for_ip_list
    ips = {a.ip.split('%')[0] for a in attempts}
    geo = geo_for_ip_list(ips)
    return Response({
        'ok': True,
        'geo_pending': True,  # el frontend puede pedir refrescar geo
        'attempts': [{
            'id': a.id, 'ip': a.ip, 'email': a.email, 'success': a.success,
            'user_agent': a.user_agent, 'created_at': a.created_at.isoformat(),
            'geo': geo.get(a.ip.split('%')[0]),
        } for a in attempts],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def security_blocks(request):
    """IPs bloqueadas con detalle (auto/manual/ssh) y estado."""
    qs = IpBlock.objects.all()
    ipf = request.query_params.get('status')
    if ipf in (IpBlock.STATUS_BLOCKED, IpBlock.STATUS_QUIET):
        qs = qs.filter(status=ipf)
    blocks = list(qs[:300])
    return Response({
        'ok': True,
        'threshold': DEFAULT_THRESHOLD,
        'blocks': [{
            'id': b.id, 'ip': b.ip, 'status': b.status, 'mode': b.mode,
            'fail_count': b.fail_count, 'first_attempt_at':
                b.first_attempt_at.isoformat() if b.first_attempt_at else None,
            'last_attempt_at': b.last_attempt_at.isoformat() if b.last_attempt_at else None,
            'block_started_at': b.block_started_at.isoformat() if b.block_started_at else None,
            'notes': b.notes, 'created_at': b.created_at.isoformat(),
        } for b in blocks],
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def security_ssh(request):
    """Eventos SSH detectados en auth.log + sincroniza bloqueos ssh."""
    limit = int(request.query_params.get('limit', 100))
    since_h = int(request.query_params.get('since_hours', 24))
    # sincronizar (throttled) para poblar SshEvent y bloquear IPs ssh
    from .worker import sync_ssh_now
    try:
        new_ev, new_blk = sync_ssh_now()
    except Exception:
        new_ev = new_blk = 0
    events = _read_ssh_events(limit=limit, since_hours=since_h)
    _sync_ssh_blocks(events)
    # eventos guardados en DB (recientes) para el historial
    qs = SshEvent.objects.filter(
        created_at__gte=timezone.now() - timedelta(hours=since_h)).order_by('-created_at')[:limit]
    stored = [{
        'ip': s.ip, 'username': s.username, 'event_type': s.event_type,
        'created_at': s.created_at.isoformat(),
    } for s in qs]
    return Response({
        'ok': True,
        'log_available': os.path.exists(SSH_AUTH_LOG),
        'synced_new': new_ev,
        'blocked_ssh': new_blk,
        'events': [{
            'ip': e['ip'], 'username': e['username'], 'event_type': e['event_type'],
            'created_at': e['ts'].isoformat() if e['ts'] else None, 'raw_line': e['raw_line'],
        } for e in events[:limit]],
        'stored': stored,
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def security_block_manual(request):
    """Bloqueo manual de una IP."""
    ip = (request.data.get('ip') or '').strip()
    if not ip:
        return Response({'ok': False, 'error': 'IP requerida'}, status=400)
    try:
        ipaddress.ip_address(ip)
    except ValueError:
        return Response({'ok': False, 'error': 'IP inválida'}, status=400)
    now = timezone.now()
    blk, _ = IpBlock.objects.get_or_create(ip=_ip_key(ip), defaults={
        'status': IpBlock.STATUS_BLOCKED, 'mode': IpBlock.MODE_MANUAL,
        'last_attempt_at': now, 'block_started_at': now,
    })
    blk.status = IpBlock.STATUS_BLOCKED
    blk.mode = IpBlock.MODE_MANUAL
    blk.block_started_at = now
    blk.notes = request.data.get('notes', '') or blk.notes or ''
    blk.save()
    return Response({'ok': True, 'ip': ip, 'status': 'blocked'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def security_unblock(request):
    """Desbloquea una IP (la pasa a quiet)."""
    ip = (request.data.get('ip') or '').strip()
    if not ip:
        return Response({'ok': False, 'error': 'IP requerida'}, status=400)
    from .ip_throttle import mark_quiet
    b = mark_quiet(ip)
    return Response({'ok': True, 'ip': ip, 'status': b.status if b else 'not_found'})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def security_geo_refresh(request):
    """Resuelve la geo de IPs sin caché (límite por llamada). El frontend lo llama
    al montar. Recolecta IPs de attempts/blocks/ssh y consulta ipinfo para las
    que no estén cacheadas, hasta MAX."""
    from . import geo as geo_mod
    from .models import IpGeoCache
    max_resolve = int(request.query_params.get('max', 8))
    max_resolve = min(max_resolve, 20)

    # recolectar IPs recientes de las 3 fuentes
    ips = set()
    now = timezone.now()
    for a in LoginAttempt.objects.filter(created_at__gte=now - timedelta(hours=48))[:300]:
        ips.add(a.ip)
    for b in IpBlock.objects.all()[:300]:
        ips.add(b.ip)
    # solo las que NO están en caché
    cached_ips = set(IpGeoCache.objects.filter(ip__in=ips).values_list('ip', flat=True))
    pending = [i for i in ips if i not in cached_ips and not geo_mod._is_private(i)][:max_resolve]

    resolved = {}
    errors = 0
    for ip in pending:
        try:
            resolved[ip] = geo_mod.get_ip_geo(ip)
        except Exception:
            errors += 1

    return Response({
        'ok': True,
        'pending': len(pending),
        'resolved': len(resolved),
        'errors': errors,
        'stale': len(ips) - len(cached_ips),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def security_check(request):
    """Estado de una IP puntual (para diagnóstico)."""
    from .ip_throttle import get_client_ip
    my_ip = get_client_ip(request)
    ip = request.query_params.get('ip') or my_ip
    b = IpBlock.objects.filter(ip=_ip_key(ip)).first()
    return Response({
        'ok': True, 'ip': ip, 'my_ip': my_ip,
        'blocked': bool(b and b.status == IpBlock.STATUS_BLOCKED),
        'record': {
            'status': b.status if b else None,
            'mode': b.mode if b else None,
            'fail_count': b.fail_count if b else 0,
            'last_attempt_at': b.last_attempt_at.isoformat() if (b and b.last_attempt_at) else None,
        } if b else None,
    })
