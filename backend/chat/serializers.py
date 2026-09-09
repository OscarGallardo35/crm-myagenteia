from rest_framework import serializers
from chat.models import Conversation, Message, ModelConfig
from agents.models import AgentTask, AgentLog
from leads.models import Lead, Deal
from posting.models import Post, ScheduledPost
from dashboard.models import RateLimit, ResourceWidget, AgentStatus


class ModelConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModelConfig
        fields = '__all__'


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = '__all__'


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = '__all__'


class AgentTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentTask
        fields = '__all__'


class AgentLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentLog
        fields = '__all__'


class LeadSerializer(serializers.ModelSerializer):
    class Meta:
        model = Lead
        fields = '__all__'


class DealSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deal
        fields = '__all__'


class PostSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = '__all__'


class ScheduledPostSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledPost
        fields = '__all__'


class RateLimitSerializer(serializers.ModelSerializer):
    class Meta:
        model = RateLimit
        fields = '__all__'


class ResourceWidgetSerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceWidget
        fields = '__all__'


class AgentStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = AgentStatus
        fields = '__all__'
