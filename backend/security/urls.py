from django.urls import path
from . import views

urlpatterns = [
    path('summary/', views.security_summary),
    path('attempts/', views.security_attempts),
    path('blocks/', views.security_blocks),
    path('ssh/', views.security_ssh),
    path('block/', views.security_block_manual),
    path('unblock/', views.security_unblock),
    path('check/', views.security_check),
]
