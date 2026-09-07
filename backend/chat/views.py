from rest_framework import generics
from .models import ModelConfig, Conversation, Message
from .serializers import ModelConfigSerializer, ConversationSerializer, MessageSerializer

class ModelConfigListCreate(generics.ListCreateAPIView):
    queryset = ModelConfig.objects.all()
    serializer_class = ModelConfigSerializer

class ModelConfigDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = ModelConfig.objects.all()
    serializer_class = ModelConfigSerializer

class ConversationListCreate(generics.ListCreateAPIView):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer

class ConversationDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer

class MessageListCreate(generics.ListCreateAPIView):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer

class MessageDetail(generics.RetrieveUpdateDestroyAPIView):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer