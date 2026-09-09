from django.urls import path
from . import views

urlpatterns = [
    path('dashboard/stats/', views.dashboard_stats),
    path('agents/status/', views.agents_status),
    path('chats/', views.chats_list),
    path('leads/', views.leads_list),
    path('posts/', views.posts_list),
    path('scheduled/', views.scheduled_list),
    path('agents/', views.agents_list),
    path('leads/<int:lead_id>/status/', views.update_lead_status),
]
