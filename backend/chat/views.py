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


# ===== Conversaciones del CRM (nuevo chat, renombrar, retomar) =====

@api_view(['GET', 'POST'])
def crm_conversations(request):
    """Lista o crea conversaciones del CRM (sesiones del panel)."""
    if request.method == 'GET':
        convos = Conversation.objects.filter(user=request.user).order_by('-updated_at')
        data = [{
            'id': c.id,
            'title': c.title or 'Nueva conversación',
            'created_at': c.created_at.isoformat() if c.created_at else None,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            'model': c.model_config.name if c.model_config else '',
            'message_count': c.messages.count(),
            'preview': (c.messages.order_by('-created_at').first().content[:80]
                        if c.messages.first() else ''),
        } for c in convos]
        return Response({'ok': True, 'conversations': data})

    # POST: crear nueva conversación (sesión nueva)
    serializer = ConversationSerializer(data={
        'user': request.user.id,
        'title': request.data.get('title') or None,
    })
    if serializer.is_valid():
        c = serializer.save()
        return Response({'ok': True, 'conversation': {
            'id': c.id,
            'title': c.title or 'Nueva conversación',
            'created_at': c.created_at.isoformat() if c.created_at else None,
            'updated_at': c.updated_at.isoformat() if c.updated_at else None,
            'model': '',
            'message_count': 0,
            'preview': '',
        }}, status=201)
    return Response({'ok': False, 'errors': serializer.errors}, status=400)


@api_view(['GET', 'PATCH'])
def crm_conversation_detail(request, pk):
    """Retoma (GET data) o renombra (PATCH title) una conversación del CRM."""
    try:
        c = Conversation.objects.get(pk=pk, user=request.user)
    except Conversation.DoesNotExist:
        return Response({'ok': False, 'error': 'Conversación no encontrada'}, status=404)

    if request.method == 'GET':
        msgs = c.messages.order_by('created_at')
        return Response({
            'ok': True,
            'conversation': {
                'id': c.id,
                'title': c.title or 'Nueva conversación',
                'model': c.model_config.name if c.model_config else '',
                'message_count': msgs.count(),
            },
            'messages': [{
                'role': m.role,
                'content': m.content,
                'created_at': m.created_at.isoformat() if m.created_at else None,
            } for m in msgs],
        })

    # PATCH: renombrar
    title = request.data.get('title')
    if title is not None:
        c.title = str(title).strip()
        c.save()
    return Response({'ok': True, 'title': c.title})


@api_view(['POST'])
def crm_conversation_message(request, pk):
    """Agrega un mensaje a una conversación del CRM (usuario o asistente)."""
    try:
        c = Conversation.objects.get(pk=pk, user=request.user)
    except Conversation.DoesNotExist:
        return Response({'ok': False, 'error': 'Conversación no encontrada'}, status=404)
    role = request.data.get('role', 'user')
    content = request.data.get('content')
    if not content:
        return Response({'ok': False, 'error': 'content requerido'}, status=400)
    m = Message.objects.create(conversation=c, role=role, content=content)
    c.save()  # actualizar updated_at
    return Response({'ok': True, 'message': {
        'role': m.role, 'content': m.content,
        'created_at': m.created_at.isoformat() if m.created_at else None,
    }}, status=201)
