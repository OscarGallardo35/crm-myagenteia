from django.contrib import admin
from .models import Post, ScheduledPost

@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ('title', 'platform', 'status', 'scheduled_at', 'posted_at', 'created_by', 'created_at')
    list_filter = ('platform', 'status', 'scheduled_at', 'posted_at')
    search_fields = ('title', 'content')
    readonly_fields = ('created_at', 'updated_at', 'posted_at')

@admin.register(ScheduledPost)
class ScheduledPostAdmin(admin.ModelAdmin):
    list_display = ('post', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('post__title',)
    readonly_fields = ('created_at',)