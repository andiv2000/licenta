from flask import request, jsonify, session, current_app
from . import api_bp
import logging
import json
import os
import sys
import threading
import urllib3

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))

try:
    import exam_analysis
except ImportError as e:
    exam_analysis = None

logger = logging.getLogger(__name__)

def _answer_keys_path():
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    return os.path.join(project_root, 'answer_keys.json')

def _load_answer_keys_dict():
    path = _answer_keys_path()
    if not os.path.exists(path):
        return {}
    with open(path, 'r') as f:
        return json.load(f)

def _guard_answer_key_use(answer_key):
    from ..utils.auth import assert_answer_key_allowed, can_correct
    role = session.get('user_role', '')
    faculty = session.get('user_faculty')
    if not can_correct(role, faculty):
        return jsonify({'success': False, 'message': 'Nu aveți drept de corectare. Contactați administratorul.'}), 403
    ok, msg = assert_answer_key_allowed(answer_key, role, faculty, _load_answer_keys_dict())
    if not ok:
        return jsonify({'success': False, 'message': msg}), 403
    return None

@api_bp.route('/exam/answer-keys', methods=['GET'])
def get_answer_keys():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    try:
        from ..utils.auth import get_filtered_answer_keys

        user_role = session.get('user_role', '')
        user_faculty = session.get('user_faculty', '')

        answer_keys_file = _answer_keys_path()
        logger.info(f"Looking for answer keys at: {answer_keys_file}")
        
        if os.path.exists(answer_keys_file):
            answer_keys_data = _load_answer_keys_dict()
            
            filtered = get_filtered_answer_keys(user_role, user_faculty, answer_keys_data)

            if filtered is None:
                logger.warning(f"User {session.get('user_email')} has faculty='default' — no keys")
                return jsonify({
                    'success': False,
                    'message': 'Facultatea nu este configurată. Contactați administratorul.'
                }), 403

            logger.info(f"Loaded {len(filtered)} answer keys for {user_role}/{user_faculty}")
            
            return jsonify({
                'success': True,
                'answer_keys': filtered
            }), 200
        else:
            logger.warning(f"Answer keys file not found at {answer_keys_file}")
            return jsonify({
                'success': True,
                'answer_keys': []
            }), 200
    
    except Exception as e:
        logger.error(f"Error loading answer keys: {e}")
        return jsonify({
            'success': False,
            'message': 'Error loading answer keys'
        }), 500

@api_bp.route('/exam/answer-keys/<key_name>', methods=['DELETE'])
def delete_answer_key(key_name):
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    from ..utils.auth import assert_can_manage_key_name
    role = session.get('user_role', '')
    faculty = session.get('user_faculty')
    ok, msg = assert_can_manage_key_name(key_name, role, faculty)
    if not ok:
        return jsonify({'success': False, 'message': msg}), 403
    
    try:
        answer_keys_file = _answer_keys_path()
        
        if not os.path.exists(answer_keys_file):
            return jsonify({'success': False, 'message': 'Answer keys file not found'}), 404
        
        answer_keys_data = _load_answer_keys_dict()
        
        if key_name not in answer_keys_data:
            return jsonify({'success': False, 'message': f'Answer key "{key_name}" not found'}), 404
        
        del answer_keys_data[key_name]
        
        with open(answer_keys_file, 'w') as f:
            json.dump(answer_keys_data, f, indent=2)
        
        logger.info(f"Deleted answer key: {key_name}")
        
        return jsonify({
            'success': True,
            'message': f'Answer key "{key_name}" deleted successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error deleting answer key: {e}")
        return jsonify({
            'success': False,
            'message': f'Error deleting answer key: {str(e)}'
        }), 500

@api_bp.route('/exam/answer-keys/<key_name>', methods=['GET'])
def get_answer_key(key_name):
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    denied = _guard_answer_key_use(key_name)
    if denied:
        return denied
    
    try:
        answer_keys_file = _answer_keys_path()
        
        if not os.path.exists(answer_keys_file):
            return jsonify({'success': False, 'message': 'Answer keys file not found'}), 404
        
        answer_keys_data = _load_answer_keys_dict()
        
        if key_name not in answer_keys_data:
            return jsonify({'success': False, 'message': f'Answer key "{key_name}" not found'}), 404
        
        return jsonify({
            'success': True,
            'name': key_name,
            'answers': answer_keys_data[key_name]
        }), 200
    
    except Exception as e:
        logger.error(f"Error getting answer key: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/exam/answer-keys/<key_name>', methods=['PUT'])
def update_answer_key(key_name):
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    try:
        data = request.get_json()
        answers = data.get('answers')
        new_name = data.get('name', key_name)
        
        if not answers:
            return jsonify({'success': False, 'message': 'No answers provided'}), 400
        
        from ..utils.auth import assert_can_manage_key_name
        user_role = session.get('user_role', '')
        user_faculty = session.get('user_faculty')

        ok, msg = assert_can_manage_key_name(key_name, user_role, user_faculty)
        if not ok:
            return jsonify({'success': False, 'message': msg}), 403
        ok, msg = assert_can_manage_key_name(new_name, user_role, user_faculty)
        if not ok:
            return jsonify({'success': False, 'message': msg}), 403

        answer_keys_file = _answer_keys_path()
        
        answer_keys_data = _load_answer_keys_dict() if os.path.exists(answer_keys_file) else {}
        
        if new_name != key_name and key_name in answer_keys_data:
            del answer_keys_data[key_name]
        
        answer_keys_data[new_name] = answers
        
        with open(answer_keys_file, 'w') as f:
            json.dump(answer_keys_data, f, indent=2)
        
        logger.info(f"Updated answer key: {key_name} -> {new_name} ({len(answers)} questions)")
        
        return jsonify({
            'success': True,
            'message': f'Answer key "{new_name}" updated successfully'
        }), 200
    
    except Exception as e:
        logger.error(f"Error updating answer key: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/exam/answer-keys/generate-random', methods=['POST'])
def generate_random_key():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    from ..utils.auth import can_manage_answer_keys, normalize_faculty, is_global_admin

    user_role = session.get('user_role', '')
    user_faculty = session.get('user_faculty')
    if not can_manage_answer_keys(user_role, user_faculty):
        return jsonify({'success': False, 'message': 'Doar administratorii pot crea bareme'}), 403

    import random

    data = request.get_json() or {}
    faculty = normalize_faculty(data.get('faculty', '').strip()) or ''
    name = data.get('name', '').strip()
    fpse_variant = int(data.get('fpse_variant', 4))

    bound = normalize_faculty(user_faculty)
    if bound:
        faculty = bound
    elif is_global_admin(user_role, user_faculty):
        faculty = normalize_faculty(faculty) or faculty

    if not faculty:
        return jsonify({'success': False, 'message': 'Trebuie selectată o facultate'}), 400

    FACULTY_CONFIGS = {
        'fsgc':  {'qps': [15, 15, 15], 'skip': 3, 'total': 45, 'options': ['A','B','C','D']},
        'drept': {'qps': [15, 15, 15], 'skip': 3, 'total': 45, 'options': ['A','B','C','D']},
        'sport': {'qps': [15, 15, 15], 'skip': 3, 'total': 45, 'options': ['A','B','C','D']},
        'fsas':  {'qps': [20, 15, 10], 'skip': 2, 'total': 45, 'options': ['A','B','C','D']},
        'fpse':  {'qps': [15, 15, 15], 'skip': 3, 'total': 45, 'options': ['A','B','C','D']},
        'fpse3': {'qps': [12, 12, 12], 'skip': 2, 'total': 36, 'options': ['A','B','C']},
        'finalizare': {'qps': [10], 'skip': 2, 'total': 10, 'options': ['A','B','C','D']},
    }

    faculty_key = faculty
    if faculty == 'fpse':
        faculty_key = 'fpse3' if fpse_variant == 3 else 'fpse'

    cfg = FACULTY_CONFIGS.get(faculty_key, {'qps': [15, 15, 15], 'skip': 3, 'total': 45, 'options': ['A','B','C','D']})
    total = cfg['total']
    options = cfg['options']

    name_prefix = 'FPSE3' if (faculty == 'fpse' and fpse_variant == 3) else faculty.upper()
    if not name:
        name = f"{name_prefix} - Random {random.randint(1000, 9999)}"

    if name_prefix.lower() not in name.lower() and faculty not in name.lower():
        name = f"{name_prefix} - {name}"

    answers = {}
    for i in range(1, total + 1):
        answers[str(i)] = [random.choice(options)]

    from ..utils.auth import assert_can_manage_key_name
    ok, msg = assert_can_manage_key_name(name, user_role, user_faculty)
    if not ok:
        return jsonify({'success': False, 'message': msg}), 403

    answer_keys_file = _answer_keys_path()

    try:
        existing = _load_answer_keys_dict() if os.path.exists(answer_keys_file) else {}

        if name in existing:
            return jsonify({'success': False, 'message': f'Un barem cu numele "{name}" există deja'}), 409

        existing[name] = answers
        with open(answer_keys_file, 'w') as f:
            json.dump(existing, f, indent=2)

        logger.info(f"Generated random key '{name}' for faculty '{faculty}' ({total} questions)")
        return jsonify({
            'success': True,
            'message': f'Barem "{name}" generat cu succes ({total} întrebări)',
            'name': name,
            'total_questions': total,
        }), 201
    except Exception as e:
        logger.error(f"Error generating random key: {e}")
        return jsonify({'success': False, 'message': str(e)}), 500

@api_bp.route('/exam/analyze', methods=['POST'])
def analyze_exam():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    return jsonify({
        'success': True,
        'message': 'Analysis not yet implemented'
    }), 200

@api_bp.route('/exam/batch-process', methods=['POST'])
def batch_process():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    try:
        if 'files' not in request.files:
            return jsonify({'success': False, 'message': 'No files provided'}), 400
        
        files = request.files.getlist('files')
        if not files or len(files) == 0:
            return jsonify({'success': False, 'message': 'No files selected'}), 400
        
        if len(files) > 250:
            return jsonify({
                'success': False, 
                'message': f'Too many files. Maximum 250 allowed, got {len(files)}'
            }), 400
        
        answer_key = request.form.get('answer_key', 'DefaultKey')
        batch_id = request.form.get('batch_id', f'batch_{os.urandom(8).hex()}')

        if answer_key in ('__AUTO_DETECT__', '__AUTO_DETECT_FPSE3__', '__AUTO_DETECT_FPSE4__', '__AUTO_DETECT_FSAS__'):
            from ..utils.auth import normalize_faculty, can_correct
            _role    = session.get('user_role', '')
            _faculty = session.get('user_faculty')
            if not can_correct(_role, _faculty):
                return jsonify({'success': False, 'message': 'Nu aveți drept de corectare.'}), 403
            _fac = normalize_faculty(_faculty)
            _family_map = {
                '__AUTO_DETECT__':       'fsgc',
                '__AUTO_DETECT_FPSE3__': 'fpse',
                '__AUTO_DETECT_FPSE4__': 'fpse',
                '__AUTO_DETECT_FSAS__':  'fsas',
            }
            _family = _family_map[answer_key]
            if _fac and _fac not in _family:
                return jsonify({'success': False,
                                'message': f'Nu aveți acces la auto-detect {_family.upper()} (facultatea dvs: {_fac.upper()}).'}), 403
            _base_map = {
                '__AUTO_DETECT__':       'fsgc',
                '__AUTO_DETECT_FPSE3__': 'fpse3',
                '__AUTO_DETECT_FPSE4__': 'fpse',
                '__AUTO_DETECT_FSAS__':  'fsas',
            }
            answer_key = _base_map[answer_key]
            logger.info(f'Batch: mod auto-detect activat → baza="{answer_key}"')
        else:
            denied = _guard_answer_key_use(answer_key)
            if denied:
                return denied
        
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        batch_folder = os.path.join(project_root, 'uploads', 'batch_temp', batch_id)
        results_folder = os.path.join(project_root, 'static', 'results', batch_id)
        os.makedirs(batch_folder, exist_ok=True)
        os.makedirs(results_folder, exist_ok=True)
        
        logger.info(f"Batch processing {len(files)} files with key '{answer_key}'")
        logger.info(f"Batch folder: {batch_folder}")
        
        saved_count = 0
        allowed_ext = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff')
        for file in files:
            if file and file.filename != '':
                ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
                if f'.{ext}' in allowed_ext:
                    filepath = os.path.join(batch_folder, file.filename)
                    file.save(filepath)
                    saved_count += 1
                else:
                    logger.warning(f"Skipped invalid file: {file.filename}")
        
        if saved_count == 0:
            return jsonify({
                'success': False,
                'message': 'No valid image files found'
            }), 400
        
        logger.info(f"Saved {saved_count} files to {batch_folder}")
        
        if exam_analysis is None:
            return jsonify({
                'success': False,
                'message': 'Analysis module not available'
            }), 500
        
        custom_config = None
        try:
            if exam_analysis and hasattr(exam_analysis, 'get_config_for_key'):
                custom_config = exam_analysis.get_config_for_key(answer_key)
                logger.info(f"Sheet config for '{answer_key}': {custom_config}")
            else:
                answer_keys_file = os.path.join(project_root, 'answer_keys.json')
                if os.path.exists(answer_keys_file):
                    with open(answer_keys_file, 'r') as f:
                        all_keys = json.load(f)
                    answer_key_data = all_keys.get(answer_key)
                    if answer_key_data:
                        total_q = len(answer_key_data)
                        custom_config = {
                            'total_questions': total_q,
                            'questions_per_section': [15, 15, 15],
                            'skip_rows': 3,
                        }
        except Exception as e:
            logger.error(f"Error loading answer key config: {e}")
        
        results = exam_analysis.process_all_images_in_directory(
            directory=batch_folder,
            output_dir=results_folder,
            answer_key_name=answer_key,
            custom_config=custom_config,
            batch_processing_id=batch_id
        )
        
        successful = len([r for r in results if r.get('grade') is not None])
        failed = len([r for r in results if r.get('status') == 'Error'])
        needs_calibration = len([r for r in results if r.get('status') == 'NeedCalibration'])

        for result in results:
            if result.get('annotated_image'):
                continue
            ann_path = result.get('annotated_image_path')
            if ann_path and os.path.exists(ann_path):
                result['annotated_image'] = (
                    f'/static/results/{batch_id}/{os.path.basename(ann_path)}'
                )

        summary_path = os.path.join(results_folder, f'exam_results_{answer_key}_{batch_id}.csv')
        
        response = {
            'success': True,
            'batch_id': batch_id,
            'message': f'Processed {len(results)} files',
            'statistics': {
                'total_files': len(results),
                'successful': successful,
                'failed': failed,
                'needs_calibration': needs_calibration,
            },
            'results': results,
            'summary_file': os.path.basename(summary_path) if os.path.exists(summary_path) else None,
            'output_folder': batch_id
        }
        
        logger.info(f"Batch {batch_id} completed: {successful} success, {failed} failed, {needs_calibration} need calibration")
        return jsonify(response), 200
    
    except Exception as e:
        logger.exception(f"Batch processing error: {e}")
        return jsonify({
            'success': False,
            'message': f'Batch processing error: {str(e)}'
        }), 500

@api_bp.route('/exam/export-nocodb', methods=['POST'])
def export_to_nocodb():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    import time
    import requests as http_requests
    from ..utils.config import (
        EXAM_NOCODB_API_KEY, EXAM_NOCODB_BASE_URL,
        EXAM_NOCODB_PROJECT_NAME, EXAM_NOCODB_TABLE_NAMES,
        RESULTS_FOLDER, APP_ROOT
    )
    from ..utils.drive_upload import upload_files_parallel

    if not all([EXAM_NOCODB_API_KEY, EXAM_NOCODB_BASE_URL, EXAM_NOCODB_PROJECT_NAME]):
        return jsonify({'success': False, 'message': 'NocoDB not configured'}), 500

    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'message': 'No data provided'}), 400

    results_list = data.get('results', [])
    answer_key_name = data.get('answer_key', '')

    if not results_list:
        return jsonify({'success': False, 'message': 'No results to export'}), 400

    _auto_detect_sentinels = ('__AUTO_DETECT__', '__AUTO_DETECT_FPSE3__', '__AUTO_DETECT_FPSE4__', '__AUTO_DETECT_FSAS__', 'fsgc', 'fpse3', 'fpse', 'fsas', '')
    if answer_key_name in _auto_detect_sentinels or not answer_key_name:
        for r in results_list:
            ak_real = r.get('answer_key_used', '')
            if ak_real and ak_real not in _auto_detect_sentinels:
                answer_key_name = ak_real
                break

    if answer_key_name and answer_key_name not in ('__AUTO_DETECT__', '__AUTO_DETECT_FPSE3__', '__AUTO_DETECT_FPSE4__', '__AUTO_DETECT_FSAS__'):
        denied = _guard_answer_key_use(answer_key_name)
        if denied:
            return denied

    t_start = time.time()

    ak_lower = answer_key_name.lower()
    if 'fsgc' in ak_lower:
        faculty_key = 'fsgc'
    elif 'drept' in ak_lower:
        faculty_key = 'drept'
    elif 'sport' in ak_lower:
        faculty_key = 'sport'
    elif 'fsas' in ak_lower:
        faculty_key = 'fsas'
    elif 'fpse' in ak_lower:
        faculty_key = 'fpse'
    elif 'finalizare' in ak_lower or 'finlizare' in ak_lower:
        faculty_key = 'finalizare'
    else:
        faculty_key = 'default'

    drive_faculty = faculty_key if faculty_key != 'default' else 'fsgc'
    table_name = EXAM_NOCODB_TABLE_NAMES.get(faculty_key, EXAM_NOCODB_TABLE_NAMES['default'])

    valid_items = []
    drive_upload_tasks = []

    for item in results_list:
        student_id = item.get('student_id')
        grade = item.get('grade')
        answers = item.get('answers')
        status = item.get('status', '')
        annotated_image = item.get('annotated_image', '')

        if not student_id or status == 'Error':
            continue

        ans_str = ''
        num_q = 0
        if answers and isinstance(answers, dict):
            num_q = len(answers)
            try:
                sorted_ans = sorted(answers.items(), key=lambda kv: (kv[0][0], int(kv[0][1:])))
            except (ValueError, TypeError):
                sorted_ans = sorted(answers.items())
            parts = []
            for qid, val in sorted_ans:
                if isinstance(val, list):
                    parts.append(f'{qid}:{"+".join(val)}')
                else:
                    parts.append(f'{qid}:{val}')
            ans_str = ', '.join(parts)

        img_path = None
        if annotated_image:
            img_rel = annotated_image.lstrip('/')
            if img_rel.startswith('static/'):
                candidate = os.path.join(APP_ROOT, img_rel)
                if os.path.isfile(candidate):
                    img_path = candidate

        if img_path:
            drive_filename = f'{student_id}_{os.path.basename(img_path)}'
            drive_upload_tasks.append((img_path, drive_filename, str(student_id)))

        valid_items.append({
            'student_id': str(student_id),
            'grade': float(grade) if grade is not None else None,
            'answers': ans_str,
            'num_questions': num_q,
            'answer_key_used': answer_key_name,
        })

    if not valid_items:
        return jsonify({'success': False, 'message': 'No valid results to export'}), 400

    t_drive_start = time.time()
    drive_links = upload_files_parallel(drive_upload_tasks, drive_faculty, max_workers=8)
    t_drive = time.time() - t_drive_start
    logger.info(f'Drive uploads: {len(drive_upload_tasks)} files in {t_drive:.1f}s '
                f'({len(drive_upload_tasks)/max(t_drive,0.01):.1f} files/s)')

    for item in valid_items:
        item['link_drive'] = drive_links.get(item['student_id'], '')

    t_noco_start = time.time()
    bulk_url = f"{EXAM_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/bulk/v1/{EXAM_NOCODB_PROJECT_NAME}/{table_name}"
    noco_headers = {'xc-token': EXAM_NOCODB_API_KEY, 'Content-Type': 'application/json'}

    noco_session = http_requests.Session()
    noco_session.headers.update(noco_headers)
    noco_session.verify = False

    exported = 0
    errors = []
    chunk_size = 100

    for i in range(0, len(valid_items), chunk_size):
        chunk = valid_items[i:i + chunk_size]
        try:
            resp = noco_session.post(bulk_url, json=chunk, timeout=30)
            resp.raise_for_status()
            exported += len(chunk)
        except Exception as e:
            err_msg = str(e)
            if hasattr(e, 'response') and e.response is not None:
                err_msg = e.response.text[:300]
            logger.warning(f'Bulk insert failed for chunk {i//chunk_size}: {err_msg}, falling back to individual inserts')
            single_url = f"{EXAM_NOCODB_BASE_URL.rstrip('/')}/api/v1/db/data/v1/{EXAM_NOCODB_PROJECT_NAME}/{table_name}"
            for item in chunk:
                try:
                    resp2 = noco_session.post(single_url, json=item, timeout=15)
                    resp2.raise_for_status()
                    exported += 1
                except Exception as e2:
                    err2 = str(e2)
                    if hasattr(e2, 'response') and e2.response is not None:
                        err2 = e2.response.text[:200]
                    errors.append(f'{item["student_id"]}: {err2}')
                    logger.error(f'NocoDB single insert failed for {item["student_id"]}: {err2}')

    noco_session.close()
    t_noco = time.time() - t_noco_start
    t_total = time.time() - t_start
    logger.info(f'NocoDB export: {exported}/{len(valid_items)} to {table_name} '
                f'in {t_noco:.1f}s  (total export: {t_total:.1f}s)')

    if errors:
        return jsonify({
            'success': exported > 0,
            'message': f'Exported {exported} results to {table_name}. {len(errors)} failed.',
            'exported': exported,
            'errors': errors[:10],
            'timing': {'drive_s': round(t_drive, 1), 'noco_s': round(t_noco, 1), 'total_s': round(t_total, 1)},
        }), 200 if exported > 0 else 500

    return jsonify({
        'success': True,
        'message': f'All {exported} results exported to {table_name}.',
        'exported': exported,
        'timing': {'drive_s': round(t_drive, 1), 'noco_s': round(t_noco, 1), 'total_s': round(t_total, 1)},
    }), 200

def _fetch_grades_from_nocodb(table_name):
    import requests as http_requests
    from ..utils.config import (
        EXAM_NOCODB_API_KEY, EXAM_NOCODB_BASE_URL,
        EXAM_NOCODB_PROJECT_NAME
    )
    base_url = EXAM_NOCODB_BASE_URL.rstrip('/')
    data_url = f"{base_url}/api/v1/db/data/v1/{EXAM_NOCODB_PROJECT_NAME}/{table_name}"
    headers = {'xc-token': EXAM_NOCODB_API_KEY}
    grades = []
    offset = 0
    limit = 200
    while True:
        resp = http_requests.get(
            data_url,
            headers=headers,
            params={'fields': 'grade', 'limit': limit, 'offset': offset},
            verify=False,
            timeout=15
        )
        resp.raise_for_status()
        page = resp.json()
        rows = page.get('list', [])
        if not rows:
            break
        for row in rows:
            g = row.get('grade')
            if g is not None:
                try:
                    grades.append(float(g))
                except (ValueError, TypeError):
                    pass
        offset += limit
        page_info = page.get('pageInfo', {})
        if not page_info.get('isLastPage', True) is False:
            break
    return grades

def _compute_stats(all_grades):
    if not all_grades:
        return {'total': 0, 'distribution': {}, 'stats': {}}
    buckets = {
        '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0,
        '5-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0
    }
    passed = 0
    failed = 0
    for g in all_grades:
        if g >= 5:
            passed += 1
        else:
            failed += 1
        if g < 2:
            buckets['1-2'] += 1
        elif g < 3:
            buckets['2-3'] += 1
        elif g < 4:
            buckets['3-4'] += 1
        elif g < 5:
            buckets['4-5'] += 1
        elif g < 6:
            buckets['5-6'] += 1
        elif g < 7:
            buckets['6-7'] += 1
        elif g < 8:
            buckets['7-8'] += 1
        elif g < 9:
            buckets['8-9'] += 1
        else:
            buckets['9-10'] += 1
    total = len(all_grades)
    avg = sum(all_grades) / total
    sorted_g = sorted(all_grades)
    median = sorted_g[total // 2] if total % 2 == 1 else (sorted_g[total // 2 - 1] + sorted_g[total // 2]) / 2
    return {
        'total': total,
        'distribution': buckets,
        'stats': {
            'average': round(avg, 2),
            'median': round(median, 2),
            'min': round(min(all_grades), 2),
            'max': round(max(all_grades), 2),
            'passed': passed,
            'failed': failed,
            'pass_rate': round(passed / total * 100, 1),
        }
    }

@api_bp.route('/exam/dashboard-stats', methods=['GET'])
def get_dashboard_stats():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    from ..utils.auth import is_global_admin, is_faculty_admin, normalize_faculty
    from ..utils.config import EXAM_NOCODB_TABLE_NAMES

    role    = session.get('user_role')
    faculty = session.get('user_faculty')

    if is_global_admin(role, faculty):
        all_grades = []
        seen_tables = set()
        for key, table_name in EXAM_NOCODB_TABLE_NAMES.items():
            if key == 'default' or table_name in seen_tables:
                continue
            seen_tables.add(table_name)
            try:
                all_grades.extend(_fetch_grades_from_nocodb(table_name))
            except Exception as e:
                logger.error(f'Dashboard stats fetch error for {table_name}: {e}')
        result = _compute_stats(all_grades)
        result['faculty_label'] = 'toate facultățile'

    elif is_faculty_admin(role, faculty):
        fac = normalize_faculty(faculty)
        table_name = EXAM_NOCODB_TABLE_NAMES.get(fac, EXAM_NOCODB_TABLE_NAMES['default'])
        try:
            all_grades = _fetch_grades_from_nocodb(table_name)
        except Exception as e:
            logger.error(f'Dashboard stats fetch error for {table_name}: {e}')
            all_grades = []
        result = _compute_stats(all_grades)
        result['faculty_label'] = fac.upper() if fac else faculty

    else:
        return jsonify({'success': False, 'message': 'Access denied'}), 403

    result['success'] = True
    return jsonify(result), 200

@api_bp.route('/exam/stats', methods=['GET'])
def get_exam_stats():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    from ..utils.config import EXAM_NOCODB_TABLE_NAMES

    faculty = request.args.get('faculty', '').lower().strip()
    if not faculty or faculty not in EXAM_NOCODB_TABLE_NAMES:
        return jsonify({'success': False, 'message': 'Invalid faculty'}), 400

    from ..utils.auth import is_global_admin, normalize_faculty
    role = session.get('user_role', 'user')
    user_faculty = normalize_faculty(session.get('user_faculty'))
    if not is_global_admin(role, session.get('user_faculty')):
        if not user_faculty or faculty != user_faculty:
            return jsonify({'success': False, 'message': 'Access denied'}), 403

    table_name = EXAM_NOCODB_TABLE_NAMES.get(faculty, EXAM_NOCODB_TABLE_NAMES['default'])
    try:
        all_grades = _fetch_grades_from_nocodb(table_name)
    except Exception as e:
        logger.error(f'NocoDB stats fetch error: {e}')
        return jsonify({'success': False, 'message': f'Failed to fetch data: {str(e)}'}), 500

    result = _compute_stats(all_grades)
    result['success'] = True
    result['faculty'] = faculty
    return jsonify(result), 200

def _fetch_answers_from_nocodb(table_name):
    import requests as http_requests
    from ..utils.config import (
        EXAM_NOCODB_API_KEY, EXAM_NOCODB_BASE_URL,
        EXAM_NOCODB_PROJECT_NAME
    )
    base_url = EXAM_NOCODB_BASE_URL.rstrip('/')
    data_url = f"{base_url}/api/v1/db/data/v1/{EXAM_NOCODB_PROJECT_NAME}/{table_name}"
    headers = {'xc-token': EXAM_NOCODB_API_KEY}
    all_answers = []
    offset = 0
    limit = 200
    while True:
        resp = http_requests.get(
            data_url,
            headers=headers,
            params={'fields': 'answers', 'limit': limit, 'offset': offset},
            verify=False,
            timeout=15
        )
        resp.raise_for_status()
        page = resp.json()
        rows = page.get('list', [])
        if not rows:
            break
        for row in rows:
            ans = row.get('answers')
            if ans and isinstance(ans, str) and ans.strip():
                all_answers.append(ans.strip())
        offset += limit
        page_info = page.get('pageInfo', {})
        if not page_info.get('isLastPage', True) is False:
            break
    return all_answers

def _parse_answer_string(ans_str):
    result = {}
    parts = [p.strip() for p in ans_str.split(',') if ':' in p]
    for part in parts:
        qid, _, val = part.partition(':')
        qid = qid.strip()
        val = val.strip()
        if not qid or not val:
            continue
        answers = [v.strip().upper() for v in val.split('+') if v.strip()]
        result[qid] = answers
    return result

@api_bp.route('/exam/question-stats', methods=['GET'])
def get_question_stats():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401

    from ..utils.config import EXAM_NOCODB_TABLE_NAMES

    faculty = request.args.get('faculty', '').lower().strip()
    if not faculty or faculty not in EXAM_NOCODB_TABLE_NAMES:
        return jsonify({'success': False, 'message': 'Invalid faculty'}), 400

    from ..utils.auth import is_global_admin, normalize_faculty
    role = session.get('user_role', 'user')
    user_faculty = normalize_faculty(session.get('user_faculty'))
    if not is_global_admin(role, session.get('user_faculty')):
        if not user_faculty or faculty != user_faculty:
            return jsonify({'success': False, 'message': 'Access denied'}), 403

    questions_param = request.args.get('questions', '').strip()
    selected_questions = set()
    if questions_param:
        selected_questions = {q.strip() for q in questions_param.split(',') if q.strip()}

    answer_key_name = request.args.get('answer_key', '').strip()
    correct_answers_map = {}
    if answer_key_name:
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        answer_keys_file = os.path.join(project_root, 'answer_keys.json')
        try:
            if os.path.exists(answer_keys_file):
                with open(answer_keys_file, 'r') as f:
                    all_keys = json.load(f)
                key_data = all_keys.get(answer_key_name, {})
                for qnum, correct in key_data.items():
                    correct_answers_map[str(qnum)] = correct
                    idx = int(qnum)
                    if idx <= 15:
                        correct_answers_map[f'A{idx:02d}'] = correct
                    elif idx <= 30:
                        correct_answers_map[f'B{idx-15:02d}'] = correct
                    elif idx <= 45:
                        correct_answers_map[f'C{idx-30:02d}'] = correct
                    else:
                        correct_answers_map[f'A{idx:02d}'] = correct
        except Exception as e:
            logger.warning(f'Could not load answer key for question stats: {e}')

    table_name = EXAM_NOCODB_TABLE_NAMES.get(faculty, EXAM_NOCODB_TABLE_NAMES['default'])
    try:
        raw_answers = _fetch_answers_from_nocodb(table_name)
    except Exception as e:
        logger.error(f'Failed to fetch answers for question stats: {e}')
        return jsonify({'success': False, 'message': f'Failed to fetch data: {str(e)}'}), 500

    question_dist = {}
    total_students = len(raw_answers)

    for ans_str in raw_answers:
        parsed = _parse_answer_string(ans_str)
        for qid, chosen in parsed.items():
            if selected_questions and qid not in selected_questions:
                continue
            if qid not in question_dist:
                question_dist[qid] = {'A': 0, 'B': 0, 'C': 0, 'D': 0, 'no_response': 0, 'multiple': 0}
            if not chosen or chosen == ['']:
                question_dist[qid]['no_response'] += 1
            elif len(chosen) > 1:
                question_dist[qid]['multiple'] += 1
            else:
                opt = chosen[0].upper()
                if opt in ('A', 'B', 'C', 'D'):
                    question_dist[qid][opt] += 1
                else:
                    question_dist[qid]['no_response'] += 1

    def sort_key(qid):
        if len(qid) >= 2 and qid[0].isalpha():
            try:
                return (qid[0], int(qid[1:]))
            except ValueError:
                pass
        try:
            return ('', int(qid))
        except ValueError:
            return (qid, 0)

    sorted_qids = sorted(question_dist.keys(), key=sort_key)
    
    questions_result = []
    for qid in sorted_qids:
        dist = question_dist[qid]
        correct = correct_answers_map.get(qid, [])
        questions_result.append({
            'question_id': qid,
            'distribution': dist,
            'correct_answer': correct,
            'total_responses': sum(dist.values()),
        })

    all_qids = set()
    for ans_str in raw_answers:
        parsed = _parse_answer_string(ans_str)
        all_qids.update(parsed.keys())
    all_qids_sorted = sorted(all_qids, key=sort_key)

    student_correct = []
    multiplier = 0.225 if faculty == 'sport' else 0.2
    if correct_answers_map:
        for ans_str in raw_answers:
            parsed = _parse_answer_string(ans_str)
            row = {}
            for qid in all_qids_sorted:
                correct = correct_answers_map.get(qid, [])
                if not correct:
                    continue
                chosen = parsed.get(qid, [])
                correct_set = {c.upper() for c in correct}
                row[qid] = 1 if (len(chosen) == 1 and chosen[0].upper() in correct_set) else 0
            student_correct.append(row)

    result = {
        'success': True,
        'faculty': faculty,
        'total_students': total_students,
        'all_questions': all_qids_sorted,
        'questions': questions_result,
        'multiplier': multiplier,
    }
    if student_correct:
        result['student_correct'] = student_correct

    return jsonify(result), 200
