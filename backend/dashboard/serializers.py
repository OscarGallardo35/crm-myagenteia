from rest_framework import serializers
from .models import ResourceWidget, RateLimit, AgentStatus

class ResourceWidgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceWidget
        fields = '__all__'

class RateLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = RateLimit
        fields = '__all__'

class AgentStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentStatus
        fields = '__all__'