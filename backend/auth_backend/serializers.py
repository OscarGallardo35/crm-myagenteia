
from rest_framework import serializers
from django.contrib.auth.models import User

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    
    def validate(self, data):
        email = data.get("email")
        password = data.get("password")
        if email != "cagriostroxd@gmail.com" or password != "12345":
            raise serializers.ValidationError("Credenciales inválidas")
        try:
            user = User.objects.get(email=email)
            if not user.check_password(password):
                raise serializers.ValidationError("Credenciales inválidas")
        except User.DoesNotExist:
            raise serializers.ValidationError("Credenciales inválidas")
        data["user"] = user
        return data

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "email", "first_name", "last_name"]
