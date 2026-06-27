import os
import sys
from gevent import monkey
monkey.patch_all()

_env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

from app import create_app
from app.routes import register_blueprints

app = create_app()
register_blueprints(app)

def main():
    debug = os.environ.get('FLASK_DEBUG', 'False') == 'True'
    host = os.environ.get('FLASK_HOST', '0.0.0.0')
    port = int(os.environ.get('FLASK_PORT', 5000))
    
    print(f"Starting Flask application on {host}:{port}")
    app.run(host=host, port=port, debug=debug)

if __name__ == '__main__':
    main()
