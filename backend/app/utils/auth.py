import hashlib
import requests
from .config import (
    LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
    LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL
)

def encrypt_password(password_string):
    return hashlib.sha512(password_string.encode('utf-8')).hexdigest()

def normalize_faculty(faculty):
    if faculty is None:
        return None
    f = str(faculty).strip().lower()
    if f in ('', 'default', 'none', 'null'):
        return None
    return f

def is_global_admin(role, faculty):
    return role == 'admin' and normalize_faculty(faculty) is None

def is_faculty_admin(role, faculty):
    return role == 'admin' and normalize_faculty(faculty) is not None

def can_manage_answer_keys(role, faculty):
    return role == 'admin'

def can_correct(role, faculty):
    if role == 'admin' and normalize_faculty(faculty) is None:
        return True
    return normalize_faculty(faculty) is not None

def key_matches_faculty(key_name, faculty):
    fac = normalize_faculty(faculty)
    if not fac:
        return True
    return fac in (key_name or '').lower()

def get_filtered_answer_keys(role, faculty, correct_answers):
    all_keys = list(correct_answers.keys())
    fac = normalize_faculty(faculty)

    if role == 'admin' and fac is None:
        return all_keys

    if fac is None:
        return None

    return [k for k in all_keys if fac in k.lower()]

def assert_answer_key_allowed(answer_key, role, faculty, correct_answers):
    filtered = get_filtered_answer_keys(role, faculty, correct_answers)
    if filtered is None:
        return False, 'Facultatea nu este configurată. Contactați administratorul.'
    if answer_key not in filtered:
        return False, f'Nu aveți acces la baremul "{answer_key}".'
    return True, None

def assert_can_manage_key_name(key_name, role, faculty):
    if not can_manage_answer_keys(role, faculty):
        return False, 'Doar administratorii pot gestiona baremele.'
    if is_global_admin(role, faculty):
        return True, None
    fac = normalize_faculty(faculty)
    if fac and not key_matches_faculty(key_name, fac):
        return False, f'Numele baremului trebuie să conțină "{fac.upper()}".'
    return True, None

def user_permissions(role, faculty):
    fac = normalize_faculty(faculty)
    global_admin = is_global_admin(role, faculty)
    faculty_admin = is_faculty_admin(role, faculty)
    return {
        'is_global_admin': global_admin,
        'is_faculty_admin': faculty_admin,
        'can_manage_users': global_admin,
        'can_manage_answer_keys': can_manage_answer_keys(role, faculty),
        'can_correct': can_correct(role, faculty),
        'faculty': fac,
    }

def verify_nocodb_login(email, password):
    if not all([LOGIN_NOCODB_API_KEY, LOGIN_NOCODB_PROJECT_NAME,
                LOGIN_NOCODB_TABLE_NAME, LOGIN_NOCODB_BASE_URL]):
        return False, None, None

    hashed_password = encrypt_password(password)
    api_endpoint = f"{LOGIN_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{LOGIN_NOCODB_PROJECT_NAME}/{LOGIN_NOCODB_TABLE_NAME}"
    headers = {"accept": "application/json", "xc-token": LOGIN_NOCODB_API_KEY}
    params = {"where": f"(adresa,eq,{email})"}

    try:
        response = requests.get(api_endpoint, headers=headers, params=params, verify=False, timeout=15)
        response.raise_for_status()
        data = response.json()

        user_list = data.get("list", data if isinstance(data, list) else [])

        if len(user_list) == 1:
            user_record = user_list[0]
            if user_record.get("parola") == hashed_password:
                role = user_record.get("role", '')
                if role == 'pending':
                    return False, "pending", None
                if role in ['admin', 'user', 'teacher']:
                    faculty = normalize_faculty(user_record.get("faculty"))
                    return True, role, faculty

        return False, None, None
    except Exception as e:
        print(f"NocoDB login error: {e}")
        return False, None, None
