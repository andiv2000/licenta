from flask import Flask
from flask_session import Session
from datetime import timedelta
import os
import redis
import logging

def create_app():
    app = Flask(__name__, template_folder='../templates', static_folder='../../static')
    
    bypass_auth = os.environ.get('BYPASS_AUTH', '0') == '1'
    
    app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'your_very_secret_key_123!@#_CHANGE_ME')
    
    redis_host = os.environ.get('REDIS_HOST', 'localhost')
    redis_port = int(os.environ.get('REDIS_PORT', 6379))
    
    app.config['SESSION_TYPE'] = 'redis'
    app.config['SESSION_REDIS'] = redis.Redis(host=redis_host, port=redis_port, db=2)
    app.config['SESSION_PERMANENT'] = False
    app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SECURE'] = True
    
    Session(app)

    if bypass_auth:
        @app.before_request
        def auto_login():
            from flask import session as _s
            if 'user_email' not in _s:
                _s['user_email'] = 'bypass@local'
                _s['user_role'] = 'admin'
                _s['user_faculty'] = None
        app.logger.warning("*** BYPASS_AUTH is ON — authentication disabled ***")

    redis_progress_client = None
    try:
        redis_host = os.environ.get('REDIS_HOST', 'localhost')
        redis_port = int(os.environ.get('REDIS_PORT', 6379))
        redis_db_progress = int(os.environ.get('REDIS_DB_PROGRESS', 1))
        
        redis_progress_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db_progress,
            decode_responses=True
        )
        redis_progress_client.ping()
        app.logger.info(f"Redis connected (Host: {redis_host}, Port: {redis_port}, DB: {redis_db_progress})")
    except Exception as e:
        app.logger.error(f"Redis connection failed: {e}")
        redis_progress_client = None
    
    app.redis_client = redis_progress_client
    
    return app
