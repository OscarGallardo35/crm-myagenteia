from django.contrib import admin
from .models import Lead, Deal

@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ('first_name', 'last_name', 'email', 'company', 'status', 'source', 'value', 'assigned_to', 'created_at')
    list_filter = ('status', 'source', 'created_at', 'assigned_to')
    search_fields = ('first_name', 'last_name', 'email', 'company')
    readonly_fields = ('created_at', 'updated_at')

@admin.register(Deal)
class DealAdmin(admin.ModelAdmin):
    list_display = ('title', 'lead', 'value', 'stage', 'expected_close_date', 'assigned_to', 'created_at')
    list_filter = ('stage', 'expected_close_date', 'assigned_to')
    search_fields = ('title', 'lead__first_name', 'lead__last_name', 'lead__email')
    readonly_fields = ('created_at', 'updated_at')