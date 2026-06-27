from flask import request, jsonify, session
from . import api_bp
from ..utils.auth import verify_nocodb_login, normalize_faculty, user_permissions, is_global_admin

@api_bp.route('/auth/login', methods=['POST'])
def login():
    import os
    import json
    
    data = request.get_json()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    
    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password required'}), 400
    
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    users_file = os.path.join(project_root, 'backend', 'users.json')
    
    if os.path.exists(users_file):
        try:
            with open(users_file, 'r') as f:
                users = json.load(f)
            
            if email in users and users[email].get('password') == password:
                user = users[email]
                role = user.get('role', 'teacher')
                faculty = normalize_faculty(user.get('faculty'))
                session['user_email'] = email
                session['user_role'] = role
                session['user_faculty'] = faculty
                perms = user_permissions(role, faculty)
                return jsonify({
                    'success': True,
                    'message': 'Login successful',
                    'user': {
                        'email': email,
                        'role': role,
                        'faculty': faculty,
                        **perms,
                    }
                }), 200
        except Exception as e:
            pass

    success, role, faculty = verify_nocodb_login(email, password)
    
    if role == 'pending':
        return jsonify({'success': False, 'message': 'Your account is awaiting admin approval. Please try again later.'}), 403
    
    if success:
        faculty = normalize_faculty(faculty)
        session['user_email'] = email
        session['user_role'] = role
        session['user_faculty'] = faculty
        perms = user_permissions(role, faculty)
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'user': {'email': email, 'role': role, 'faculty': faculty, **perms},
        }), 200
    
    return jsonify({'success': False, 'message': 'Invalid credentials'}), 401

@api_bp.route('/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out'}), 200

@api_bp.route('/auth/register', methods=['POST'])
def register():
    from app.utils.auth import encrypt_password
    from app.utils.config import (
        LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
        LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL
    )
    import requests as req
    
    data = request.get_json()
    email = data.get('email', '').strip()
    password = data.get('password', '').strip()
    faculty = data.get('faculty', 'default')
    
    is_admin_action = is_global_admin(session.get('user_role'), session.get('user_faculty'))
    role = data.get('role', 'user') if is_admin_action else 'pending'
    
    if not email or not password:
        return jsonify({'success': False, 'message': 'Email and password required'}), 400
    
    if len(password) < 4:
        return jsonify({'success': False, 'message': 'Password must be at least 4 characters'}), 400
    
    hashed_password = encrypt_password(password)
    
    api_endpoint = f"{LOGIN_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{LOGIN_NOCODB_PROJECT_NAME}/{LOGIN_NOCODB_TABLE_NAME}"
    headers = {"accept": "application/json", "xc-token": LOGIN_NOCODB_API_KEY, "Content-Type": "application/json"}
    
    try:
        check_params = {"where": f"(adresa,eq,{email})"}
        check_resp = req.get(api_endpoint, headers=headers, params=check_params, verify=False, timeout=15)
        check_data = check_resp.json()
        user_list = check_data.get("list", check_data if isinstance(check_data, list) else [])
        
        if len(user_list) > 0:
            return jsonify({'success': False, 'message': 'User already exists'}), 400
        
        new_user = {
            "adresa": email,
            "parola": hashed_password,
            "role": role if role in ['admin', 'user', 'teacher', 'pending'] else 'pending',
            "faculty": faculty
        }
        
        create_resp = req.post(api_endpoint, headers=headers, json=new_user, verify=False, timeout=15)
        
        if create_resp.status_code in [200, 201]:
            msg = 'User created successfully' if is_admin_action else 'Account created. An administrator must approve your account before you can log in.'
            return jsonify({
                'success': True,
                'message': msg,
                'pending_approval': not is_admin_action,
                'user': {'email': email, 'role': role, 'faculty': faculty}
            }), 201
        else:
            return jsonify({
                'success': False,
                'message': f'NocoDB error: {create_resp.text}'
            }), 500
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error creating user: {str(e)}'}), 500

@api_bp.route('/auth/user', methods=['GET'])
def get_current_user():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    role = session.get('user_role')
    faculty = session.get('user_faculty')
    perms = user_permissions(role, faculty)
    return jsonify({
        'success': True,
        'user': {
            'email': session.get('user_email'),
            'role': role,
            'faculty': faculty,
            **perms,
        }
    }), 200

@api_bp.route('/auth/users', methods=['GET'])
def list_users():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    if not is_global_admin(session.get('user_role'), session.get('user_faculty')):
        return jsonify({'success': False, 'message': 'Admin global access required'}), 403

    from app.utils.config import (
        LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
        LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL
    )
    import requests as req

    api_endpoint = f"{LOGIN_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{LOGIN_NOCODB_PROJECT_NAME}/{LOGIN_NOCODB_TABLE_NAME}"
    headers = {"accept": "application/json", "xc-token": LOGIN_NOCODB_API_KEY}

    try:
        resp = req.get(api_endpoint, headers=headers, verify=False, timeout=15,
                       params={"limit": 200})
        data = resp.json()
        rows = data.get("list", data if isinstance(data, list) else [])

        users = []
        for row in rows:
            users.append({
                'id': str(row.get('Id', row.get('id', ''))),
                'email': row.get('adresa', ''),
                'role': row.get('role', 'user'),
                'faculty': row.get('faculty', 'default'),
                'created_at': row.get('CreatedAt', row.get('created_at', '')),
                'approved': row.get('approved', 'true'),
            })

        return jsonify({'success': True, 'users': users}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error fetching users: {str(e)}'}), 500

@api_bp.route('/auth/users/<path:user_id>', methods=['DELETE'])
def delete_user(user_id):
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    if not is_global_admin(session.get('user_role'), session.get('user_faculty')):
        return jsonify({'success': False, 'message': 'Admin global access required'}), 403

    from app.utils.config import (
        LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
        LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL
    )
    import requests as req

    api_endpoint = f"{LOGIN_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{LOGIN_NOCODB_PROJECT_NAME}/{LOGIN_NOCODB_TABLE_NAME}/{user_id}"
    headers = {"accept": "application/json", "xc-token": LOGIN_NOCODB_API_KEY}

    try:
        resp = req.delete(api_endpoint, headers=headers, verify=False, timeout=15)
        if resp.status_code in [200, 204]:
            return jsonify({'success': True, 'message': 'User deleted'}), 200
        else:
            return jsonify({'success': False, 'message': f'NocoDB error: {resp.text}'}), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error deleting user: {str(e)}'}), 500

@api_bp.route('/auth/pending-users', methods=['GET'])
def pending_users():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    if not is_global_admin(session.get('user_role'), session.get('user_faculty')):
        return jsonify({'success': False, 'message': 'Admin global access required'}), 403

    from app.utils.config import (
        LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
        LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL
    )
    import requests as req

    api_endpoint = f"{LOGIN_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{LOGIN_NOCODB_PROJECT_NAME}/{LOGIN_NOCODB_TABLE_NAME}"
    headers = {"accept": "application/json", "xc-token": LOGIN_NOCODB_API_KEY}

    try:
        resp = req.get(api_endpoint, headers=headers, verify=False, timeout=15,
                       params={"where": "(role,eq,pending)", "limit": 200})
        data = resp.json()
        rows = data.get("list", data if isinstance(data, list) else [])

        pending = []
        for row in rows:
            pending.append({
                'id': str(row.get('Id', row.get('id', ''))),
                'email': row.get('adresa', ''),
                'role': row.get('role', 'user'),
                'faculty': row.get('faculty', 'default'),
                'created_at': row.get('CreatedAt', row.get('created_at', '')),
            })

        return jsonify({'success': True, 'users': pending}), 200
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error fetching pending users: {str(e)}'}), 500

@api_bp.route('/auth/users/<path:user_id>/approve', methods=['PATCH'])
def approve_user(user_id):
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    if not is_global_admin(session.get('user_role'), session.get('user_faculty')):
        return jsonify({'success': False, 'message': 'Admin global access required'}), 403

    from app.utils.config import (
        LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
        LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL
    )
    import requests as req

    data = request.get_json() or {}
    new_role = data.get('role', 'user')
    new_faculty = data.get('faculty')

    api_endpoint = f"{LOGIN_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{LOGIN_NOCODB_PROJECT_NAME}/{LOGIN_NOCODB_TABLE_NAME}/{user_id}"
    headers = {"accept": "application/json", "xc-token": LOGIN_NOCODB_API_KEY, "Content-Type": "application/json"}

    update_payload = {"role": new_role if new_role in ['admin', 'user', 'teacher'] else 'user'}
    if new_faculty:
        update_payload["faculty"] = new_faculty

    try:
        resp = req.patch(api_endpoint, headers=headers, json=update_payload, verify=False, timeout=15)
        if resp.status_code in [200, 204]:
            return jsonify({'success': True, 'message': 'User approved successfully'}), 200
        else:
            return jsonify({'success': False, 'message': f'NocoDB error: {resp.text}'}), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error approving user: {str(e)}'}), 500

@api_bp.route('/auth/users/<path:user_id>/reject', methods=['DELETE'])
def reject_user(user_id):
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    if not is_global_admin(session.get('user_role'), session.get('user_faculty')):
        return jsonify({'success': False, 'message': 'Admin global access required'}), 403

    from app.utils.config import (
        LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
        LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL
    )
    import requests as req

    api_endpoint = f"{LOGIN_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{LOGIN_NOCODB_PROJECT_NAME}/{LOGIN_NOCODB_TABLE_NAME}/{user_id}"
    headers = {"accept": "application/json", "xc-token": LOGIN_NOCODB_API_KEY}

    try:
        resp = req.delete(api_endpoint, headers=headers, verify=False, timeout=15)
        if resp.status_code in [200, 204]:
            return jsonify({'success': True, 'message': 'User rejected and removed'}), 200
        else:
            return jsonify({'success': False, 'message': f'NocoDB error: {resp.text}'}), resp.status_code
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error rejecting user: {str(e)}'}), 500
