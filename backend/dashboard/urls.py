from django.urls import path
from chat.views import dashboard_stats as ds_stats, agents_status as ag_stats

urlpatterns = [
    path('', ds_stats, name='dashboard-stats'),
    path('stats/', ds_stats, name='dashboard-stats-alt'),
]
