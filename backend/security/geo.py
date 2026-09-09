"""Geolocalización de IPs con caché (para el panel Seguridad)."""
import json
import urllib.request
from datetime import timedelta

from django.utils import timezone

from .models import IpGeoCache

CACHE_TTL = timedelta(hours=24)
# TTL corto de reintento si ipinfo devolvió error (para no cachear fallos mucho rato)
ERROR_TTL = timedelta(minutes=10)

# ipinfo.io gratuito no devuelve country_name — derivarlo del código ISO
_COUNTRY_NAMES = {
    'AR': 'Argentina', 'BR': 'Brasil', 'CL': 'Chile', 'CO': 'Colombia', 'MX': 'México',
    'UY': 'Uruguay', 'PY': 'Paraguay', 'PE': 'Perú', 'BO': 'Bolivia', 'VE': 'Venezuela',
    'EC': 'Ecuador', 'US': 'Estados Unidos', 'DE': 'Alemania', 'ES': 'España', 'FR': 'Francia',
    'GB': 'Reino Unido', 'NL': 'Países Bajos', 'IT': 'Italia', 'PT': 'Portugal', 'RU': 'Rusia',
    'CN': 'China', 'IN': 'India', 'JP': 'Japón', 'KR': 'Corea del Sur', 'SG': 'Singapur',
    'UA': 'Ucrania', 'PL': 'Polonia', 'SE': 'Suecia', 'CH': 'Suiza', 'CA': 'Canadá',
    'AU': 'Australia', 'NZ': 'Nueva Zelanda', 'ZA': 'Sudáfrica', 'NG': 'Nigeria', 'EG': 'Egipto',
    'IL': 'Israel', 'AE': 'Emiratos', 'TR': 'Turquía', 'ID': 'Indonesia', 'VN': 'Vietnam',
    'TH': 'Tailandia', 'PH': 'Filipinas', 'MY': 'Malasia', 'HK': 'Hong Kong', 'TW': 'Taiwán',
}


def _country_name(cc):
    if not cc:
        return ''
    return _COUNTRY_NAMES.get(cc.upper(), '')


def _fill_country_name(d):
    d = dict(d)
    if not d.get('country_name') and d.get('country'):
        d['country_name'] = _country_name(d['country'])
    return d


def _is_private(ip):
    """IPs locales/internas no se geolocalizan (devuelven 'local')."""
    import ipaddress
    try:
        addr = ipaddress.ip_address(ip)
        return addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved
    except ValueError:
        return True


def get_ip_geo(ip):
    """Devuelve {country, country_name, region, city, org, hostname, is_local}.
    Consulta ipinfo.io y cachea en DB. IPs privadas -> local instantáneo."""
    if _is_private(ip):
        return {'country': '', 'country_name': 'Local/Interna', 'region': '',
                'city': '', 'org': '', 'hostname': '', 'is_local': True}

    cached = IpGeoCache.objects.filter(ip=ip).first()
    if cached:
        # usar caché si no expiró; el org vacío indica un intento fallido previo
        if timezone.now() - cached.fetched_at < CACHE_TTL:
            return _fill_country_name({
                'country': cached.country, 'country_name': cached.country_name,
                'region': cached.region, 'city': cached.city, 'org': cached.org,
                'hostname': cached.hostname, 'is_local': False,
            })
        if timezone.now() - cached.fetched_at < ERROR_TTL and not cached.org and not cached.city:
            # error reciente, reintentar pronto
            return _fill_country_name({
                'country': cached.country, 'country_name': cached.country_name,
                'region': cached.region, 'city': cached.city, 'org': cached.org,
                'hostname': cached.hostname, 'is_local': False,
            })

    # consultar ipinfo
    data = {}
    try:
        req = urllib.request.Request(
            f"https://ipinfo.io/{ip}/json",
            headers={"User-Agent": "crm-seguridad"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.load(r)
    except Exception:
        data = {}

    country = (data.get('country') or '')[:2]
    country_name = data.get('country_name') or ''
    region = (data.get('region') or '')[:100]
    city = (data.get('city') or '')[:100]
    org = (data.get('org') or '')[:200]
    hostname = (data.get('hostname') or '')[:200]

    IpGeoCache.objects.update_or_create(
        ip=ip, defaults={
            'country': country, 'country_name': country_name,
            'region': region, 'city': city, 'org': org, 'hostname': hostname,
        })
    return _fill_country_name({'country': country, 'country_name': country_name, 'region': region,
                               'city': city, 'org': org, 'hostname': hostname, 'is_local': False})


def geo_for_ip_list(ips):
    """Devuelve {ip: geo_dict} para una lista de IPs (usa caché si está)."""
    result = {}
    for ip in ips:
        # primero solo caché para no disparar N consultas por request
        cached = IpGeoCache.objects.filter(ip=ip).first()
        if cached and timezone.now() - cached.fetched_at < CACHE_TTL:
            result[ip] = _fill_country_name({'country': cached.country, 'country_name': cached.country_name,
                                             'region': cached.region, 'city': cached.city, 'org': cached.org,
                                             'hostname': cached.hostname, 'is_local': _is_private(ip)})
        elif _is_private(ip):
            result[ip] = {'country': '', 'country_name': 'Local', 'region': '',
                          'city': '', 'org': '', 'hostname': '', 'is_local': True}
    return result
