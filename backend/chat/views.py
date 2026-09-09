from rest_framework import viewsets, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.contrib.auth.models import User
from chat.models import Conversation, Message, ModelConfig
from agents.models import AgentTask, AgentLog
from leads.models import Lead, Deal
from posting.models import Post, ScheduledPost
from chat.serializers import (
    ConversationSerializer, MessageSerializer, ModelConfigSerializer,
    AgentTaskSerializer, AgentLogSerializer,
    LeadSerializer, DealSerializer,
    PostSerializer, ScheduledPostSerializer
)


class ModelConfigViewSet(viewsets.ModelViewSet):
    queryset = ModelConfig.objects.all()
    serializer_class = ModelConfigSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer


class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer


class AgentTaskViewSet(viewsets.ModelViewSet):
    queryset = AgentTask.objects.all()
    serializer_class = AgentTaskSerializer


class AgentLogViewSet(viewsets.ModelViewSet):
    queryset = AgentLog.objects.all()
    serializer_class = AgentLogSerializer


class LeadViewSet(viewsets.ModelViewSet):
    queryset = Lead.objects.all()
    serializer_class = LeadSerializer


class DealViewSet(viewsets.ModelViewSet):
    queryset = Deal.objects.all()
    serializer_class = DealSerializer


class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.all()
    serializer_class = PostSerializer


class ScheduledPostViewSet(viewsets.ModelViewSet):
    queryset = ScheduledPost.objects.all()
    serializer_class = ScheduledPostSerializer


@api_view(['GET'])
def dashboard_stats(request):
    """Estadísticas para el dashboard"""
    import psutil
    cpu = psutil.cpu_percent()
    ram = psutil.virtual_memory().percent
    
    rate_limits = {
        'OpenRouter': '45/min',
        'Nous': '∞',
        'NVIDIA': '0/min'
    }
    
    agents = list(AgentTask.objects.values('id', 'name', 'status').order_by('-created_at')[:5])
    scheduled = Post.objects.filter(status='scheduled').count()
    
    return Response({
        'cpu': cpu,
        'ram': ram,
        'rateLimits': rate_limits,
        'agents': agents,
        'scheduledPosts': scheduled
    })


@api_view(['GET'])
def agents_status(request):
    """Estado de sub-agentes"""
    agents = AgentTask.objects.all().order_by('-created_at')
    data = [{'id': a.id, 'name': a.name, 'type': a.agent_type, 'status': a.status} for a in agents]
    return Response(data)


@api_view(['POST'])
def update_lead_status(request, lead_id):
    """Actualizar estado de un lead"""
    try:
        lead = Lead.objects.get(id=lead_id)
        new_status = request.data.get('status')
        if new_status in ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']:
            lead.status = new_status
            lead.save()
            return Response({'status': 'ok'})
        return Response({'error': 'Invalid status'}, status=400)
    except Lead.DoesNotExist:
        return Response({'error': 'Lead not found'}, status=404)


@api_view(['GET'])
def chats_list(request):
    """Lista de conversaciones"""
    chats = Conversation.objects.all().order_by('-created_at')
    data = [{'id': c.id, 'title': c.title, 'created_at': str(c.created_at)} for c in chats]
    return Response(data)


@api_view(['GET'])
def leads_list(request):
    """Lista de leads"""
    leads = Lead.objects.all().order_by('-created_at')
    data = [{'id': l.id, 'name': l.name, 'email': l.email, 'status': l.status} for l in leads]
    return Response(data)


@api_view(['GET'])
def posts_list(request):
    """Lista de posts"""
    posts = Post.objects.all().order_by('-created_at')
    data = [{'id': p.id, 'title': p.title, 'status': p.status} for p in posts]
    return Response(data)


@api_view(['GET'])
def scheduled_list(request):
    """Lista de posts programados"""
    scheduled = ScheduledPost.objects.all().order_by('-created_at')
    data = [{'id': s.id, 'title': s.title, 'scheduled_at': str(s.scheduled_at)} for s in scheduled]
    return Response(data)


@api_view(['GET'])
def agents_list(request):
    """Lista de agentes"""
    agents = AgentTask.objects.all().order_by('-created_at')
    data = [{'id': a.id, 'name': a.name, 'type': a.agent_type, 'status': a.status} for a in agents]
    return Response(data)
