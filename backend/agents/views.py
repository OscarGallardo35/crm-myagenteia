from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def get_agents_status(request):
    # Return mock agent status
    return Response([])
