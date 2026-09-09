"""Throttling camuflado anti-brute-force.

Tras N intentos fallidos (default 3), la IP queda en 'blocked' pero el login
SIGUE devolviendo EXACTAMENTE la misma respuesta ("Credenciales inválidas",
mismo status HTTP, con un pequeño delay extra) — el atacante no detecta que
está bloqueado. Desde el panel Seguridad se ve todo el detalle.
"""
import time
import ipaddress
from datetime import timedelta

from django.utils import timezone

from .models import LoginAttempt, IpBlock

DEFAULT_THRESHOLD = 3
DEFAULT_BLOCK_MINUTES = 60 * 6  # 6 horas por defecto


def get_client_ip(request):
    """IP real del cliente. El CRM va detrás de Cloudflare Tunnel, así que la IP
    original llega en X-Forwarded-For. Evita spoofing con la lista de proxies."""
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        # XFF: "client, proxy1, proxy2" — tomar la primera no-rfc1918
        for part in xff.split(','):
            ip = part.strip()
            if not ip:
                continue
            try:
                addr = ipaddress.ip_address(ip)
            except ValueError:
                continue
            if addr.is_private or addr.is_loopback or addr.is_link_local:
                continue
            return ip
    cf_i = request.META.get('CF_CONNECTING_IP', '') or \
           request.META.get('HTTP_CF_CONNECTING_IP', '')
    if cf_i:
        return cf_i.strip()
    return request.META.get('REMOTE_ADDR', '0.0.0.0')


def _ip_key(ip):
    """Normaliza la IP para agrupar v4/v6 y rangos."""
    try:
        return str(ipaddress.ip_address(ip))
    except ValueError:
        return ip


def count_recent_failures(ip, window_minutes=30):
    since = timezone.now() - timedelta(minutes=window_minutes)
    return LoginAttempt.objects.filter(
        ip=_ip_key(ip), success=False, created_at__gte=since).count()


def is_blocked(ip):
    """¿La IP está en bloqueo camuflado activo?"""
    b = IpBlock.objects.filter(ip=_ip_key(ip)).first()
    return bool(b and b.status == IpBlock.STATUS_BLOCKED)


def record_attempt(ip, email, success, user_agent=''):
    """Registra un intento y, si corresponde, activa/actualiza el bloqueo."""
    key = _ip_key(ip)
    now = timezone.now()
    LoginAttempt.objects.create(ip=key, email=email or '', success=success,
                                user_agent=user_agent[:400])

    block, _ = IpBlock.objects.get_or_create(ip=key, defaults={
        'status': IpBlock.STATUS_BLOCKED,
        'mode': IpBlock.MODE_AUTO,
        'first_attempt_at': now,
        'last_attempt_at': now,
        'block_started_at': now,
    })

    if success:
        # éxito limpia el contador pero mantiene el historial
        if block.status == IpBlock.STATUS_QUIET:
            block.status = IpBlock.STATUS_QUIET
        block.fail_count = 0
        block.last_attempt_at = now
        block.save()
        return block

    # fallo
    if not block.first_attempt_at:
        block.first_attempt_at = now
    block.last_attempt_at = now
    recent = count_recent_failures(key, window_minutes=30)
    block.fail_count = recent if recent > block.fail_count else max(block.fail_count, recent)
    if block.fail_count < DEFAULT_THRESHOLD:
        block.status = IpBlock.STATUS_QUIET  # aún no bloquea
    else:
        block.status = IpBlock.STATUS_BLOCKED
        if not block.block_started_at:
            block.block_started_at = now
    block.save()
    return block


def should_block(ip):
    """True si hay que aplicar bloqueo camuflado (devuelve respuesta idéntica
    pero nunca autentica). Devuelve también el estado para métricas."""
    return is_blocked(ip)


def camouflage_delay(ip):
    """Delay artificial para degradar el ataque sin delatar el bloqueo.
    Escala con la antigüedad del bloqueo: 1.2s base + algo más si lleva horas."""
    b = IpBlock.objects.filter(ip=_ip_key(ip)).first()
    if not b or b.status != IpBlock.STATUS_BLOCKED or not b.block_started_at:
        return 0.0
    hours = (timezone.now() - b.block_started_at).total_seconds() / 3600.0
    return min(1.2 + hours * 0.25, 4.0)


def mark_quiet(ip):
    """Deja de bloquear (desbloqueo manual o por tiempo)."""
    b = IpBlock.objects.filter(ip=_ip_key(ip)).first()
    if b:
        b.status = IpBlock.STATUS_QUIET
        b.save()
    return b
