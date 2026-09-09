"""Worker de seguridad: sincroniza eventos SSH de auth.log y aplica bloqueos
automáticos periódicamente. Se invoca en cada request del panel si pasó un
intervalo (throttle simple), y también puede ejecutarse como script."""

import os
from datetime import timedelta

from django.utils import timezone

from .models import IpBlock, SshEvent
from .views import _read_ssh_events, _sync_ssh_blocks
from .ip_throttle import _ip_key

_last_sync = {}
SYNC_INTERVAL_MIN = 5  # sincronizar SSH como mucho cada 5 min


def sync_ssh_now(force=False):
    """Lee auth.log y guarda eventos nuevos en SshEvent + crea IpBlock ssh."""
    key = SSH_LOG = os.environ.get('SSH_AUTH_LOG', '/var/log/auth.log')
    now = timezone.now()
    last = _last_sync.get(key)
    if not force and last and (now - last).total_seconds() < SYNC_INTERVAL_MIN * 60:
        return 0, 0
    _last_sync[key] = now

    events = _read_ssh_events(limit=200, since_hours=1)
    # guardar eventos nuevos (dedupe por ip+username+minuto)
    stored = 0
    cutoff = now - timedelta(hours=1)
    existing = set(SshEvent.objects.filter(created_at__gte=cutoff)
                   .values_list('ip', 'username'))
    for e in events:
        if not e['ts']:
            continue
        try:
            ts = timezone.make_aware(e['ts']) if e['ts'].tzinfo is None else e['ts']
        except Exception:
            continue
        if (e['ip'], e['username']) in existing:
            continue
        SshEvent.objects.create(ip=_ip_key(e['ip']), username=e['username'],
                                event_type=e['event_type'], raw_line=e['raw_line'],
                                created_at=ts)
        stored += 1

    blocked_ssh = _sync_ssh_blocks(events)
    return stored, blocked_ssh


def run():
    """CLI: python -m security.worker"""
    new_events, new_blocks = sync_ssh_now(force=True)
    print(f"SSH sync: {new_events} nuevos eventos, {new_blocks} IPs bloqueadas")


if __name__ == '__main__':
    import django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()
    run()
