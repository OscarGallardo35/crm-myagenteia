from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def get_leads(request):
    # Return mock leads
    return Response([])
