from django.db import models
from django.contrib.auth.models import User

class ResourceWidget(models.Model):
    WIDGET_TYPE_CHOICES = [
        ('cpu', 'CPU Usage'),
        ('memory', 'Memory Usage'),
        ('disk', 'Disk Usage'),
        ('network', 'Network I/O'),
        ('custom', 'Custom Metric'),
    ]
    name = models.CharField(max_length=100)
    widget_type = models.CharField(max_length=20, choices=WIDGET_TYPE_CHOICES)
    # For custom widgets, we can store a query or a script
    config = models.JSONField(default=dict, blank=True)  # configuration for the widget
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class RateLimit(models.Model):
    name = models.CharField(max_length=100)
    endpoint = models.CharField(max_length=200)  # API endpoint
    limit = models.IntegerField()  # number of requests
    period = models.IntegerField()  # in seconds
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name}: {self.limit}/{self.period}s"

class AgentStatus(models.Model):
    agent_type = models.CharField(max_length=100)  # e.g., 'researcher', 'poster'
    status = models.CharField(max_length=50)  # e.g., 'idle', 'busy', 'offline'
    last_heartbeat = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    metadata = models.JSONField(default=dict, blank=True)  # any extra info

    def __str__(self):
        return f"{self.agent_type}: {self.status}"