from django.db import models
from django.contrib.auth.models import User


class LoginAttempt(models.Model):
    """Cada intento de login al CRM (exitoso o fallido), con la IP de origen."""
    ip = models.GenericIPAddressField(db_index=True)
    email = models.CharField(max_length=200, blank=True, db_index=True)
    success = models.BooleanField(default=False)
    user_agent = models.CharField(max_length=400, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['ip', 'created_at']),
        ]

    def __str__(self):
        return f"{'OK' if self.success else 'FAIL'} {self.ip} {self.email}"


class IpBlock(models.Model):
    """Bloqueo parcial de una IP (camuflado: no se le revela al atacante).

    Modos:
      'auto'   — bloqueado por el umbral de intentos fallidos (3+).
      'manual' — bloqueado por acción del operador desde Seguridad.
      'ssh'    — detectado por intentos SSH fallidos en auth.log.
    Estado:
      'blocked'    — la IP degrada silenciosamente (respuesta idéntica pero nunca autentica).
      'quiet'      — la IP dejó de atacar, sigue registrada pero sin bloqueo activo.
    """
    STATUS_BLOCKED = 'blocked'
    STATUS_QUIET = 'quiet'
    STATUS_CHOICES = [(STATUS_BLOCKED, 'Blocked'), (STATUS_QUIET, 'Quiet')]

    MODE_AUTO = 'auto'
    MODE_MANUAL = 'manual'
    MODE_SSH = 'ssh'
    MODE_CHOICES = [(MODE_AUTO, 'Auto'), (MODE_MANUAL, 'Manual'), (MODE_SSH, 'SSH')]

    ip = models.GenericIPAddressField(unique=True, db_index=True)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_BLOCKED)
    mode = models.CharField(max_length=10, choices=MODE_CHOICES, default=MODE_AUTO)
    fail_count = models.PositiveIntegerField(default=0)
    first_attempt_at = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    block_started_at = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-block_started_at', '-updated_at']

    def __str__(self):
        return f"{self.ip} [{self.status}] ({self.mode}, {self.fail_count})"


class SshEvent(models.Model):
    """Eventos de SSH detectados en auth.log del host (fail2ban complemento)."""
    ip = models.GenericIPAddressField(db_index=True)
    username = models.CharField(max_length=200, blank=True, default='')
    event_type = models.CharField(max_length=50, default='failed_password')  # failed_password | invalid_user | banned
    raw_line = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['ip', 'created_at']),
        ]

    def __str__(self):
        return f"SSH {self.event_type} {self.ip} as {self.username}"


class IpGeoCache(models.Model):
    """Caché de geolocalización de IPs (país/ISP/ciudad) para mostrar en el
    panel Seguridad sin golpear ipinfo.io en cada request."""
    ip = models.GenericIPAddressField(unique=True, db_index=True)
    country = models.CharField(max_length=2, blank=True, default='')
    country_name = models.CharField(max_length=100, blank=True, default='')
    region = models.CharField(max_length=100, blank=True, default='')
    city = models.CharField(max_length=100, blank=True, default='')
    org = models.CharField(max_length=200, blank=True, default='')
    hostname = models.CharField(max_length=200, blank=True, default='')
    fetched_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-fetched_at']

    def __str__(self):
        return f"{self.ip} {self.country_name} ({self.org})"
