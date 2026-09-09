from django.db import models
from django.contrib.auth.models import User


class UserToken(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="auth_token")
    token = models.CharField(max_length=255, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Token for {self.user.email}"
