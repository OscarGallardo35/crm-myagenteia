from django.urls import path
from . import views
from . import hermes

urlpatterns = [
    path('dashboard/stats/', views.dashboard_stats),
    path('agents/status/', views.agents_status),
    path('chats/', views.chats_list),
    path('leads/', views.leads_list),
    path('posts/', views.posts_list),
    path('scheduled/', views.scheduled_list),
    path('agents/', views.agents_list),
    path('leads/<int:lead_id>/status/', views.update_lead_status),
    # CRM conversations (nuevo chat, retomar, renombrar, fijar, borrar)
    path('conversations/', views.crm_conversations),
    path('conversations/<int:pk>/', views.crm_conversation_detail),
    path('conversations/<int:pk>/message/', views.crm_conversation_message),
    # Hermes bridge
    path('hermes/sessions/', hermes.hermes_sessions),
    path('hermes/sessions/<str:session_id>/', hermes.hermes_session_messages),
    path('hermes/models/', hermes.hermes_models),
]
