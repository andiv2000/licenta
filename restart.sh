#!/bin/bash
pkill -f gunicorn
sleep 2
cd /home/ubuntu/autocorectare/backend
nohup ../venv/bin/gunicorn \
  --worker-class gevent \
  --workers 15 \
  --bind 0.0.0.0:5000 \
  --timeout 300 \
  run:app > /tmp/g5000.log 2>&1 &
echo "Started $(ps aux | grep gunicorn | grep -v grep | wc -l) gunicorn processes"
