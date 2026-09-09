from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import RateLimit, ResourceWidget, AgentStatus
from .serializers import RateLimitSerializer, ResourceWidgetSerializer, AgentStatusSerializer


class RateLimitViewSet(viewsets.ModelViewSet):
    queryset = RateLimit.objects.all()
    serializer_class = RateLimitSerializer


class ResourceWidgetViewSet(viewsets.ModelViewSet):
    queryset = ResourceWidget.objects.all()
    serializer_class = ResourceWidgetSerializer


class AgentStatusViewSet(viewsets.ModelViewSet):
    queryset = AgentStatus.objects.all()
    serializer_class = AgentStatusSerializer


@api_view(['GET'])
def get_stats(request):
    # Return mock stats for now; in a real app, compute from actual data
    stats = {
        'cpu': 45,
        'ram': 60,
        'rateLimits': {
            'openai': 500,
            'anthropic': 1000,
        },
        'agents': [],
        'scheduledPosts': 0,
    }
    return Response(stats)
