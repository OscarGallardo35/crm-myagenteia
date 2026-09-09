"""Corre el turno del agente Hermes en un proceso separado.

El problema original: la tarea corría en un threading.Thread daemon DENTRO de un
worker de gunicorn. Al recargar/reiniciar gunicorn (deploy, kill -HUP, crash), el
worker recibe SIGTERM, mueren los threads daemon, y la tarea de agente (que puede
tardar minutos) se pierde a mitad de camino SIN guardar la respuesta del assistant
→ la UI queda con la burbuja "Hermes está trabajando..." colgada para siempre.

Con un proceso separado, la tarea sobrevive al ciclo de vida de los workers de
gunicorn y SIEMPRE persiste la respuesta (o un fallback) en la DB.
"""
import os
import sys

import django

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from django.core.management.base import BaseCommand  # noqa: E402


class Command(BaseCommand):
    help = "Ejecuta el turno del agente Hermes para una conversación del CRM y persiste la respuesta del assistant."

    def add_arguments(self, parser):
        parser.add_argument("user_id", type=int)
        parser.add_argument("conversation_pk", type=int)
        parser.add_argument("user_content", type=str)
        parser.add_argument("model", type=str, nargs="?", default="")
        parser.add_argument("message_pk", type=str, nargs="?", default="")

    def handle(self, *args, **options):
        from chat.views import _run_agent_background

        user_id = options["user_id"]
        conversation_pk = options["conversation_pk"]
        user_content = options["user_content"]
        model = options["model"]
        message_pk = options["message_pk"] or ""
        message = None
        if message_pk:
            try:
                message = __import__("chat.models", fromlist=["Message"]).Message.objects.get(pk=message_pk)
            except Exception:
                message = None
        # La tarea corre y SIEMPRE guarda (o un fallback) — ver _run_agent_background.
        _run_agent_background(user_id, conversation_pk, user_content, model, message)
