from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse

def api_root(request):
    endpoints = [
        {"method": "GET", "path": "/api/", "name": "api-root", "app": "config", "description": "Endpoint raíz de la API — listado completo de endpoints"},
        {"method": "POST", "path": "/api/auth/login/", "name": "login", "app": "auth_backend", "description": "Iniciar sesión con email y contraseña; devuelve token"},
        {"method": "POST", "path": "/api/auth/logout/", "name": "logout", "app": "auth_backend", "description": "Cerrar sesión — invalida el token"},
        {"method": "GET", "path": "/api/auth/me/", "name": "me", "app": "auth_backend", "description": "Obtiene info del usuario autenticado vía Bearer token"},
        {"method": "GET", "path": "/api/chat/dashboard/stats/", "name": "dashboard-stats", "app": "chat", "description": "Estadísticas del dashboard: CPU, RAM, rate limits, agents"},
        {"method": "GET", "path": "/api/chat/agents/status/", "name": "agents-status", "app": "chat", "description": "Lista de estado de sub-agentes"},
        {"method": "GET", "path": "/api/chat/chats/", "name": "chats-list", "app": "chat", "description": "Lista de conversaciones"},
        {"method": "GET", "path": "/api/chat/leads/", "name": "leads-list", "app": "chat", "description": "Lista de leads (desde chat)"},
        {"method": "GET", "path": "/api/chat/posts/", "name": "posts-list", "app": "chat", "description": "Lista de posts"},
        {"method": "GET", "path": "/api/chat/scheduled/", "name": "scheduled-list", "app": "chat", "description": "Lista de posts programados"},
        {"method": "GET", "path": "/api/chat/agents/", "name": "agents-list", "app": "chat", "description": "Lista de agentes (desde chat)"},
        {"method": "POST", "path": "/api/chat/leads/<int:lead_id>/status/", "name": "update-lead-status", "app": "chat", "description": "Actualizar estado de un lead por ID"},
        {"method": "GET", "path": "/api/dashboard/", "name": "dashboard-stats", "app": "dashboard", "description": "Estadísticas del dashboard (alias)"},
        {"method": "GET", "path": "/api/dashboard/stats/", "name": "dashboard-stats-alt", "app": "dashboard", "description": "Estadísticas del dashboard"},
        {"method": "GET", "path": "/api/leads/", "name": "leads-list", "app": "leads", "description": "Lista de leads (mock)"},
        {"method": "GET", "path": "/api/posting/posts/", "name": "post-list", "app": "posting", "description": "Lista de posts (CRUD)"},
        {"method": "POST", "path": "/api/posting/posts/", "name": "post-create", "app": "posting", "description": "Crear un post"},
        {"method": "GET", "path": "/api/posting/posts/<int:pk>/", "name": "post-detail", "app": "posting", "description": "Detalle de un post"},
        {"method": "PUT", "path": "/api/posting/posts/<int:pk>/", "name": "post-update", "app": "posting", "description": "Actualizar un post"},
        {"method": "PATCH", "path": "/api/posting/posts/<int:pk>/", "name": "post-partial-update", "app": "posting", "description": "Actualización parcial de un post"},
        {"method": "DELETE", "path": "/api/posting/posts/<int:pk>/", "name": "post-destroy", "app": "posting", "description": "Eliminar un post"},
        {"method": "GET", "path": "/api/posting/scheduled/", "name": "scheduledpost-list", "app": "posting", "description": "Lista de posts programados (CRUD)"},
        {"method": "POST", "path": "/api/posting/scheduled/", "name": "scheduledpost-create", "app": "posting", "description": "Crear un post programado"},
        {"method": "GET", "path": "/api/posting/scheduled/<int:pk>/", "name": "scheduledpost-detail", "app": "posting", "description": "Detalle de un post programado"},
        {"method": "PUT", "path": "/api/posting/scheduled/<int:pk>/", "name": "scheduledpost-update", "app": "posting", "description": "Actualizar un post programado"},
        {"method": "PATCH", "path": "/api/posting/scheduled/<int:pk>/", "name": "scheduledpost-partial-update", "app": "posting", "description": "Actualización parcial de un post programado"},
        {"method": "DELETE", "path": "/api/posting/scheduled/<int:pk>/", "name": "scheduledpost-destroy", "app": "posting", "description": "Eliminar un post programado"},
        {"method": "GET", "path": "/api/agents/", "name": "agents-status", "app": "agents", "description": "Lista de estado de agentes (mock)"},
    ]
    return JsonResponse({
        "message": "CRM MyAgenteIA API - Endpoints",
        "base_url": "https://crm.mercadodigital.pro/api/",
        "endpoints": endpoints,
    })

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api_root),
    path('api/auth/', include('auth_backend.urls')),
    path('api/chat/', include('chat.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('api/leads/', include('leads.urls')),
    path('api/posting/', include('posting.urls')),
    path('api/agents/', include('agents.urls')),
]
