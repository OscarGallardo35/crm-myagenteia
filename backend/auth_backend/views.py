import secrets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.contrib.auth import authenticate
from .models import UserToken

@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    from .serializers import LoginSerializer
    serializer = LoginSerializer(data=request.data)
    if serializer.is_valid():
        user = serializer.validated_data["user"]
        # Generar nuevo token
        token = secrets.token_urlsafe(32)
        UserToken.objects.filter(user=user).delete()
        UserToken.objects.create(user=user, token=token)
        return Response({"token": token, "user": {"email": user.email}})
    return Response(serializer.errors, status=400)

@api_view(["POST"])
@permission_classes([AllowAny])
def logout_view(request):
    token = request.data.get("token", "")
    if token:
        UserToken.objects.filter(token=token).delete()
    return Response({"message": "Logout exitoso"})

@api_view(["GET"])
@permission_classes([AllowAny])
def me_view(request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return Response({"error": "No autenticado"}, status=401)
    token = auth[7:]
    try:
        user_token = UserToken.objects.select_related("user").get(token=token)
        user = user_token.user
        return Response({"email": user.email, "id": user.id})
    except UserToken.DoesNotExist:
        return Response({"error": "Token inválido"}, status=401)
