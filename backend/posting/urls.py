from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PostViewSet, ScheduledPostViewSet

router = DefaultRouter()
router.register(r'posts', PostViewSet)
router.register(r'scheduled', ScheduledPostViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
