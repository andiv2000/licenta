import os
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload, BatchHttpRequest
from .config import SCOPES, SERVICE_ACCOUNT_FILE, GOOGLE_DRIVE_FACULTY_FOLDER_IDS

logger = logging.getLogger(__name__)

SIMPLE_UPLOAD_THRESHOLD = 5 * 1024 * 1024

def get_drive_service():
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        logger.error(f"Google Service Account file not found: {SERVICE_ACCOUNT_FILE}")
        return None
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    return build('drive', 'v3', credentials=creds, cache_discovery=False)

def _get_mimetype(filename):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    mime_map = {'png': 'image/png', 'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
                'bmp': 'image/bmp', 'tiff': 'image/tiff'}
    return mime_map.get(ext, 'application/octet-stream')

def upload_to_drive(file_path, filename, faculty_key, service=None):
    folder_id = GOOGLE_DRIVE_FACULTY_FOLDER_IDS.get(faculty_key)
    if not folder_id:
        logger.error(f"No Drive folder ID for faculty: {faculty_key}")
        return None, None

    if not os.path.exists(file_path):
        logger.error(f"File not found for Drive upload: {file_path}")
        return None, None

    if service is None:
        service = get_drive_service()
    if not service:
        return None, None

    mimetype = _get_mimetype(filename)
    file_size = os.path.getsize(file_path)
    use_resumable = file_size > SIMPLE_UPLOAD_THRESHOLD

    file_metadata = {'name': filename, 'parents': [folder_id]}
    media = MediaFileUpload(file_path, mimetype=mimetype, resumable=use_resumable)

    file_resource = service.files().create(
        body=file_metadata, media_body=media,
        fields='id, webViewLink'
    ).execute()

    file_id = file_resource.get('id')
    link = file_resource.get('webViewLink')
    logger.info(f"Uploaded '{filename}' to Drive ({faculty_key}): {link}")
    return file_id, link

def batch_set_permissions(service, file_ids):
    if not file_ids or not service:
        return

    perm_body = {'type': 'anyone', 'role': 'reader'}
    chunk_size = 100

    for i in range(0, len(file_ids), chunk_size):
        chunk = file_ids[i:i + chunk_size]
        batch = service.new_batch_http_request()
        for fid in chunk:
            batch.add(
                service.permissions().create(fileId=fid, body=perm_body),
            )
        try:
            batch.execute()
            logger.info(f"Batch permissions set for {len(chunk)} files")
        except Exception as e:
            logger.error(f"Batch permissions failed: {e}")
            for fid in chunk:
                try:
                    service.permissions().create(fileId=fid, body=perm_body).execute()
                except Exception as e2:
                    logger.warning(f"Individual permission failed for {fid}: {e2}")

def upload_files_parallel(upload_tasks, faculty_key, max_workers=8):
    if not upload_tasks:
        return {}

    service = get_drive_service()
    if not service:
        return {sid: '' for _, _, sid in upload_tasks}

    results = {}
    uploaded_file_ids = []

    def _do_upload(file_path, drive_filename, student_id):
        svc = get_drive_service()
        file_id, link = upload_to_drive(file_path, drive_filename, faculty_key, service=svc)
        return student_id, file_id, link

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(_do_upload, fp, dfn, sid): sid
            for fp, dfn, sid in upload_tasks
        }
        for future in as_completed(futures):
            sid = futures[future]
            try:
                student_id, file_id, link = future.result()
                results[student_id] = link or ''
                if file_id:
                    uploaded_file_ids.append(file_id)
            except Exception as e:
                logger.warning(f"Drive upload thread failed for {sid}: {e}")
                results[sid] = ''

    if uploaded_file_ids:
        batch_set_permissions(service, uploaded_file_ids)

    return results
