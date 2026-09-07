from django.contrib import admin
from .models import AgentTask, AgentLog

@admin.register(AgentTask)
class AgentTaskAdmin(admin.ModelAdmin):
    list_display = ('name', 'agent_type', 'status', 'priority', 'assigned_to', 'created_at')
    list_filter = ('status', 'priority', 'agent_type', 'created_at')
    search_fields = ('name', 'description')
    readonly_fields = ('created_at', 'updated_at', 'started_at', 'completed_at')

@admin.register(AgentLog)
class AgentLogAdmin(admin.ModelAdmin):
    list_display = ('agent_task', 'level', 'message_preview', 'timestamp')
    list_filter = ('level', 'timestamp')
    search_fields = ('message', 'agent_task__name')
    readonly_fields = ('timestamp',)
    
    def message_preview(self, obj):
        return obj.message[:100] + '...' if len(obj.message) > 100 else obj.message
    message_preview.short_description = 'Message Preview'