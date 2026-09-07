from django.contrib import admin
from django.urls import path, include
from django.http import JsonResponse


def api_root(request):
    return JsonResponse({
        "message": "CRM MyAgenteIA API",
        "apps": ["chat", "dashboard", "leads", "posting", "agents"]
    })


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', api_root),
    path('api/chat/', include('chat.urls')),
    path('api/dashboard/', include('dashboard.urls')),
    path('api/leads/', include('leads.urls')),
    path('api/posting/', include('posting.urls')),
    path('api/agents/', include('agents.urls')),
    path('api/auth/', include('rest_framework.urls')),
]
