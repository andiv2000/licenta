from flask import Blueprint

api_bp = Blueprint('api', __name__, url_prefix='/api')

from . import exam_routes
from . import auth_routes
from . import upload_routes
from . import chat_routes

def register_blueprints(app):
    app.register_blueprint(api_bp)
