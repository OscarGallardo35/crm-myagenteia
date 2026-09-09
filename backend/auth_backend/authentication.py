from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed
from .models import UserToken


class UserTokenAuthentication(BaseAuthentication):
    """Valida un token de la tabla auth_backend_usertoken (Authorization: Bearer <token>)."""

    keyword = "Bearer"

    def authenticate(self, request):
        auth = request.headers.get("Authorization", "")
        if not auth:
            return None
        parts = auth.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            return None
        token = parts[1]
        try:
            user_token = UserToken.objects.select_related("user").get(token=token)
        except UserToken.DoesNotExist:
            raise AuthenticationFailed("Token inválido")
        return (user_token.user, token)

    def authenticate_header(self, request):
        return self.keyword
