from django.db import models
from django.contrib.auth.models import User

class ModelConfig(models.Model):
    name = models.CharField(max_length=100)
    provider = models.CharField(max_length=50)  # e.g., openai, anthropic, etc.
    model_id = models.CharField(max_length=100)  # the model identifier from the provider
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Conversation(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    title = models.CharField(max_length=200, blank=True, null=True)
    model_config = models.ForeignKey(ModelConfig, on_delete=models.SET_NULL, null=True, blank=True)
    # Optional memory between chats: we can store a summary or key points
    memory = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.title or 'Conversation'} - {self.user.username}"

class Message(models.Model):
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    # role: user, assistant, system
    role = models.CharField(max_length=20)
    content = models.TextField()
    # Optional: store the model used for this message if it changed mid-conversation
    model_config = models.ForeignKey(ModelConfig, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.role}: {self.content[:50]}"