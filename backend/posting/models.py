from django.db import models
from django.contrib.auth.models import User

class Post(models.Model):
    PLATFORM_CHOICES = [
        ('twitter', 'Twitter/X'),
        ('linkedin', 'LinkedIn'),
        ('facebook', 'Facebook'),
        ('instagram', 'Instagram'),
        ('blog', 'Blog'),
    ]
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('scheduled', 'Scheduled'),
        ('posted', 'Posted'),
        ('failed', 'Failed'),
    ]

    title = models.CharField(max_length=200)
    content = models.TextField()
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    scheduled_at = models.DateTimeField(blank=True, null=True)
    posted_at = models.DateTimeField(blank=True, null=True)
    url = models.URLField(blank=True, null=True)  # URL of the posted content
    created_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='posts_created')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title} - {self.platform}"

class ScheduledPost(models.Model):
    post = models.OneToOneField(Post, on_delete=models.CASCADE, related_name='scheduled_post')
    # Additional scheduling details can go here if needed, but we already have scheduled_at in Post
    # This model can be used for more complex scheduling rules (recurring, etc.)
    # For simplicity, we'll just link to Post and use Post's scheduled_at
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Scheduled: {self.post.title}"