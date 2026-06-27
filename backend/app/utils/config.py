import os

APP_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

UPLOAD_FOLDER_BASE = os.path.join(APP_ROOT, 'uploads')
UPLOAD_FOLDER_FSGC = os.path.join(UPLOAD_FOLDER_BASE, 'fsgc')
UPLOAD_FOLDER_DREPT = os.path.join(UPLOAD_FOLDER_BASE, 'drept')
UPLOAD_FOLDER_SPORT = os.path.join(UPLOAD_FOLDER_BASE, 'sport')
UPLOAD_FOLDER_FSAS = os.path.join(UPLOAD_FOLDER_BASE, 'fsas')
UPLOAD_FOLDER_FPSE = os.path.join(UPLOAD_FOLDER_BASE, 'fpse')
UPLOAD_FOLDER_FINALIZARE = os.path.join(UPLOAD_FOLDER_BASE, 'finalizare')
STATIC_FOLDER = os.path.join(APP_ROOT, 'static')
RESULTS_FOLDER = os.path.join(STATIC_FOLDER, 'results')

os.makedirs(UPLOAD_FOLDER_BASE, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_FSGC, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_DREPT, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_SPORT, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_FSAS, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_FPSE, exist_ok=True)
os.makedirs(UPLOAD_FOLDER_FINALIZARE, exist_ok=True)
os.makedirs(RESULTS_FOLDER, exist_ok=True)

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff'}

LOGIN_NOCODB_API_KEY = os.environ.get("NOCODB_API_KEY_LOGIN", "-y8MCS6grmaJNIB1pY2PhQsVsZ1jFnbCraHY6LQg")
LOGIN_NOCODB_PROJECT_NAME = os.environ.get('NOCODB_PROJECT_NAME_LOGIN', 'LogInTest')
LOGIN_NOCODB_TABLE_NAME = os.environ.get('NOCODB_TABLE_NAME_LOGIN', 'credentiale')
LOGIN_NOCODB_BASE_URL = os.environ.get('NOCODB_BASE_URL_LOGIN', 'https://nc0.uvt.ro/')

EXAM_NOCODB_API_KEY = os.environ.get('NOCODB_API_KEY_EXAM', 'PD177ByKW09wXVNdgKVxzfqYDI3JTh3ukccDkJ1p')
EXAM_NOCODB_PROJECT_NAME = os.environ.get('NOCODB_PROJECT_NAME_EXAM', 'Dev AD')
EXAM_NOCODB_BASE_URL = os.environ.get('NOCODB_BASE_URL_EXAM', 'https://nc0.uvt.ro/')

EXAM_NOCODB_TABLE_NAMES = {
    'fsgc': os.environ.get('NOCODB_TABLE_NAME_FSGC', 'Fsgc'),
    'drept': os.environ.get('NOCODB_TABLE_NAME_DREPT', 'Drept'),
    'sport': os.environ.get('NOCODB_TABLE_NAME_SPORT', 'Sport'),
    'fsas': os.environ.get('NOCODB_TABLE_NAME_FSAS', 'Fsas'),
    'fpse': os.environ.get('NOCODB_TABLE_NAME_FPSE', 'Fpse'),
    'finalizare': os.environ.get('NOCODB_TABLE_NAME_FINALIZARE', 'Finlizare fsgc'),
    'default': os.environ.get('NOCODB_TABLE_NAME_EXAM', 'Fsgc')
}

SCOPES = ['https://www.googleapis.com/auth/drive']
SERVICE_ACCOUNT_FILE = os.environ.get('GOOGLE_SERVICE_ACCOUNT_FILE', os.path.join(APP_ROOT, 'credentials.json'))
GOOGLE_DRIVE_FOLDER_ID = os.environ.get('GOOGLE_DRIVE_FOLDER_ID', '1t1HQfvnj4NgrBOFXUpY4neeSKzyGhXRy')

GOOGLE_DRIVE_FOLDER_ID_FSGC = '1m6QtH1LmCQ5lcfjNCCSy7p6PXegJdbhp'
GOOGLE_DRIVE_FOLDER_ID_DREPT = '1aNLGOzkoLRypMd6XqTIBZIm8DexyQm0v'
GOOGLE_DRIVE_FOLDER_ID_SPORT = '1kTI3Vhbvv2ENp8dLF6-cPeoXdXd5vSYr'
GOOGLE_DRIVE_FOLDER_ID_FSAS = os.environ.get('GOOGLE_DRIVE_FOLDER_ID_FSAS', '1O38LQlSLJb_wbI_UN2Ht8TpkVIXMNCBg')
GOOGLE_DRIVE_FOLDER_ID_FPSE = os.environ.get('GOOGLE_DRIVE_FOLDER_ID_FPSE', '1Aqs5PiEbct1C5AIBjqDnt1yZLnNz0Jbs')
GOOGLE_DRIVE_FOLDER_ID_FINALIZARE = os.environ.get(
    'GOOGLE_DRIVE_FOLDER_ID_FINALIZARE', '1GmjA3GIzQ2qwgu3Jio07iyRrDczGrvrA'
)

GOOGLE_DRIVE_FACULTY_FOLDER_IDS = {
    'fsgc': GOOGLE_DRIVE_FOLDER_ID_FSGC,
    'drept': GOOGLE_DRIVE_FOLDER_ID_DREPT,
    'sport': GOOGLE_DRIVE_FOLDER_ID_SPORT,
    'fsas': GOOGLE_DRIVE_FOLDER_ID_FSAS,
    'fpse': GOOGLE_DRIVE_FOLDER_ID_FPSE,
    'finalizare': GOOGLE_DRIVE_FOLDER_ID_FINALIZARE,
}
