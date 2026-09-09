import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-_(-*z!q&@#+_))))zv6ju*zeq^3o$&#!0qd!z(*%v)#(_)6))$')
DEBUG = os.environ.get('DJANGO_DEBUG', 'False').lower() in ('1', 'true', 'yes')

# ALLOWED_HOSTS: env var (coma-separada) + IP pública del host + locales siempre.
# La env var del docker-compose incluye crm.mercadodigital.pro,localhost; acá además
# permitimos la IP pública (45.92.8.192) y privada del host para que el tunnel/healthcheck
# no dispare DisallowedHost.
_default_hosts = ['crm.mercadodigital.pro', 'coolify.mercadodigital.pro',
                  'studio.mercadodigital.pro', 'voice.mercadodigital.pro',
                  'enjambre.mercadodigital.pro', 'veterinaria.mercadodigital.pro',
                  'myagenteia.mercadodigital.pro', 'trama.mercadodigital.pro',
                  'servicell.mercadodigital.pro', 'localhost', '127.0.0.1',
                  'backend', '45.92.8.192', '45.92.8.192:8000']
_env_hosts = os.environ.get('ALLOWED_HOSTS', '')
if _env_hosts:
    _default_hosts = [h.strip() for h in _env_hosts.split(',') if h.strip()] + \
        ['45.92.8.192', '45.92.8.192:8000', 'localhost', '127.0.0.1', 'backend']
ALLOWED_HOSTS = list(dict.fromkeys(_default_hosts))

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    
    'corsheaders',
    'chat',
    'dashboard',
    'leads',
    'posting',
    'agents',
    'auth_backend',
    'security',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'myagenteia'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', 'postgres'),
        'HOST': os.environ.get('DB_HOST', 'localhost'),
        'PORT': os.environ.get('DB_PORT', '5432'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'

# Media files (adjuntos multimedia del chat: audio/documentos/imagenes)
MEDIA_URL = '/media/'
MEDIA_ROOT = '/app/media/'
FILE_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024  # 20 MB
DATA_UPLOAD_MAX_MEMORY_SIZE = 20 * 1024 * 1024

# Raíz de Hermes montada en el contenedor (/root/.hermes del host -> /hermes)
HERMES_ROOT = os.environ.get('HERMES_STATE_DB', '/hermes/state.db').replace('/state.db', '') or '/hermes'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'auth_backend.authentication.UserTokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

CORS_ALLOW_CREDENTIALS = True