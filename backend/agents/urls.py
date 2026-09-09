from django.urls import path
from . import views

urlpatterns = [
    path('', views.get_agents_status, name='agents-status'),
]
