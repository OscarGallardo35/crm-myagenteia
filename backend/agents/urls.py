from django.urls import path
from . import views

urlpatterns = [
    path('status/', views.agents_live, name='agents-live'),
    path('live/', views.agents_live, name='agents-live'),
    path('live/<str:delegation_id>/', views.agents_live_detail, name='agents-live-detail'),
    path('tasks/', views.agents_tasks, name='agents-tasks'),
    path('launch/', views.agents_launch, name='agents-launch'),
    path('tasks/<int:task_id>/', views.agents_task_detail, name='agents-task-detail'),
    path('sessions/', views.agents_sessions, name='agents-sessions'),
    path('sessions/spawn/', views.agents_session_spawn, name='agents-session-spawn'),
]
