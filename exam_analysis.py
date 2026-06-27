
import cv2
import numpy as np
import os, csv, re, json, logging, uuid, hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from pyzbar.pyzbar import decode as pyzbar_decode

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(levelname)s - %(message)s')

_HERE              = os.path.dirname(os.path.abspath(__file__))
ANSWER_KEYS_FILE   = os.path.join(_HERE, 'answer_keys.json')
SHEET_CONFIGS_FILE = os.path.join(_HERE, 'sheet_configs.json')

CORRECT_ANSWERS      = {}
SHEET_CONFIGS        = {}
VALID_ANSWER_OPTIONS = {'A', 'B', 'C', 'D'}

FACULTY_CONFIGS = {
    'default':    {'grading_multiplier': 0.2,   'base': 1.0},
    'sport':      {'grading_multiplier': 0.225, 'base': 1.0},
    'finalizare': {'grading_multiplier': 1.0,   'base': 1.0},
    'fpse3':      {'grading_multiplier': 0.25,  'base': 1.0},
}

USE_HARDCODED_FSAS = True

FSAS_HARDCODED = {
    'first_row_y': 775,
    'row_gap_y': 54,
    'col_gap_x': 62,
    'hw': 27,
    'hh': 21,
    'sec_A_start_x': 268,
    'sec_B_start_x': 657,
    'sec_C_start_x': 1026,
}

_FSAS_SEC_BANDS_PCT = [(0.04, 0.35), (0.38, 0.67), (0.67, 0.90)]

_FSAS_ROW_OFFSET = 1

MARK_DETECTION_CONFIGS = {
    'default': {'hsv_low': [85, 35, 40], 'hsv_high': [155, 255, 240],
                'blue_threshold': 7, 'roi_inset_frac': 0.10},
    'fsas':    {
        'hsv_low':        [80, 30, 40],
        'hsv_high':       [150, 255, 235],
        'blue_threshold': 7,
        'roi_inset_frac': 0.12,
    },
    'fsgc':    {'hsv_low': [83, 35, 35], 'hsv_high': [160, 255, 240],
                'blue_threshold': 7, 'roi_inset_frac': 0.10},
    'finalizare': {
        'hsv_low': [85, 35, 40], 'hsv_high': [155, 255, 240],
        'blue_threshold': 7,
        'roi_inset_frac': 0.10,
    },            
}

FSAS_COLUMN_NUDGE_X = 0
AUTO_ROTATION_ENABLED = True
_3SEC_EXAMPLE_COLS = {0: (1, 3), 1: (2, 0), 2: (0, 2)}

def _check_and_shift_rois(rois, image, row_gap, sheet_cfg, mdcfg):
    import cv2
    import numpy as np

    img_h, img_w = image.shape[:2]
    qps = sheet_cfg.get('questions_per_section', [20, 15, 10])

    image_for_marks = _enhance_for_marks(image)
    hsv  = cv2.cvtColor(image_for_marks, cv2.COLOR_BGR2HSV)
    HSV_LOW  = np.array(mdcfg['hsv_low'])
    HSV_HIGH = np.array(mdcfg['hsv_high'])
    BLUE_THRESHOLD = mdcfg['blue_threshold']
    ROI_INSET_FRAC = mdcfg.get('roi_inset_frac', 0.08)
    mask = cv2.inRange(hsv, HSV_LOW, HSV_HIGH)
    k    = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=1)

    shift_applied = {}

    for si in range(len(qps)):
        sec_letter = chr(ord('A') + si)
        first_key  = f'{sec_letter}01'

        if first_key not in rois:
            shift_applied[si] = False
            continue

        opts = rois[first_key]['options']
        all_x1 = [v[0] for v in opts.values()]
        all_x2 = [v[2] for v in opts.values()]
        all_y1 = [v[1] for v in opts.values()]

        roi_top   = min(all_y1)
        x_left    = min(all_x1)
        x_right   = max(all_x2)
        roi_width = max(1, x_right - x_left)

        win_y1 = max(0, roi_top - int(row_gap))
        win_y2 = max(0, roi_top)
        win_x1 = max(0, x_left)
        win_x2 = min(img_w, x_right)

        if win_y2 <= win_y1 or win_x2 <= win_x1:
            shift_applied[si] = False
            continue

        bw_ = max(1, win_x2 - win_x1)
        bh_ = max(1, win_y2 - win_y1)
        ins = int(min(bw_, bh_) * ROI_INSET_FRAC)

        seg  = mask[win_y1 + ins: win_y2 - ins,
                    win_x1 + ins: win_x2 - ins]
        npix = seg.size
        pct  = cv2.countNonZero(seg) / npix * 100 if npix > 0 else 0

        logging.info(f'_check_and_shift_rois: Sec {si} ({first_key}) '
                     f'check_window y=[{win_y1},{win_y2}] x=[{win_x1},{win_x2}] '
                     f'blue={pct:.2f}% (thresh={BLUE_THRESHOLD})')

        if pct > BLUE_THRESHOLD * 0.4:
            last_q = qps[si]
            last_key = f'{sec_letter}{last_q:02d}'
            last_has_answer = False
            if last_key in rois:
                last_opts = rois[last_key]['options']
                for opt, (x1, y1, x2, y2) in last_opts.items():
                    y1c, y2c = max(0, y1), min(img_h, y2)
                    x1c, x2c = max(0, x1), min(img_w, x2)
                    if y1c >= y2c or x1c >= x2c:
                        continue
                    bw_ = max(1, x2c - x1c)
                    bh_ = max(1, y2c - y1c)
                    ins = int(min(bw_, bh_) * ROI_INSET_FRAC)
                    seg = mask[y1c + ins:y2c - ins, x1c + ins:x2c - ins]
                    npix = seg.size
                    pct_last = cv2.countNonZero(seg) / npix * 100 if npix > 0 else 0
                    if pct_last > BLUE_THRESHOLD:
                        last_has_answer = True
                        break

            if last_has_answer and pct < BLUE_THRESHOLD:
                logging.info(f'_check_and_shift_rois: Sec {si} → NU shiftăm, '
                             f'ultimul rând ({last_key}) are răspuns')
                shift_applied[si] = False
            else:
                logging.info(f'_check_and_shift_rois: Sec {si} → SHIFT -row_gap ({int(row_gap)}px)')
                shift_applied[si] = True
        else:
            shift_applied[si] = False

    if not any(shift_applied.values()):
        return rois

    shifted_rois = {}
    for rk, qd in rois.items():
        si = ord(rk[0]) - ord('A')
        if shift_applied.get(si, False):
            new_opts = {}
            for opt, (x1, y1, x2, y2) in qd['options'].items():
                new_opts[opt] = (x1, y1 - int(row_gap), x2, y2 - int(row_gap))
            shifted_rois[rk] = {'index': qd['index'], 'options': new_opts}
        else:
            shifted_rois[rk] = qd

    shifted = [si for si, v in shift_applied.items() if v]
    logging.info(f'_check_and_shift_rois: shift aplicat pe secțiunile {shifted}')
    return shifted_rois

def _enhance_contrast(image):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8))
    l_eq = clahe.apply(l)
    enhanced = cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)
    blur = cv2.GaussianBlur(enhanced, (0, 0), 2.0)
    sharpened = cv2.addWeighted(enhanced, 1.5, blur, -0.5, 0)
    return sharpened

def _enhance_for_marks(image):
    lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4))
    l_eq = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l_eq, a, b]), cv2.COLOR_LAB2BGR)

def get_mark_detection_config(key_name):
    kl = str(key_name or '').lower()
    if 'fsgc' in kl:
        return MARK_DETECTION_CONFIGS['fsgc']
    if 'fsas' in kl:
        return MARK_DETECTION_CONFIGS['fsas']
    if 'fpse' in kl or 'drept' in kl:
        return MARK_DETECTION_CONFIGS['fsgc']
    if 'finalizare' in kl or 'finlizare' in kl:
        return MARK_DETECTION_CONFIGS['finalizare']
    return MARK_DETECTION_CONFIGS['default']    

def get_grading_config(key_name):
    kl = str(key_name).lower()
    if 'finalizare' in kl or 'finlizare' in kl:
        return FACULTY_CONFIGS['finalizare']
    if 'sport' in kl:
        return FACULTY_CONFIGS['sport']
    if 'fpse3' in kl:
        return FACULTY_CONFIGS['fpse3']
    return FACULTY_CONFIGS['default']

FSGC_VER_ZONE = (0.49, 0.80, 0.27, 0.35)
FSGC_VER_COLORS = ('albastru', 'verde', 'rosu', 'galben')
FSGC_VER_MARK_THRESH = 0.03
FPSE_VER_Y      = (0.278, 0.322)
FPSE_ALB_X      = (0.305, 0.375)
FPSE_VER_X      = (0.495, 0.570)
FPSE_VER_THRESH = 1.5

FSAS_VER_Y  = (0.195, 0.245)
FSAS_R1_X   = (0.370, 0.470)
FSAS_R2_X   = (0.560, 0.660)
FSAS_VER_THRESH = 1.5

def detect_fsgc_version(image):
    h, w = image.shape[:2]
    x1r, x2r, y1r, y2r = FSGC_VER_ZONE
    x1, x2 = int(w * x1r), int(w * x2r)
    y1, y2 = int(h * y1r), int(h * y2r)

    zone = image[y1:y2, x1:x2]
    if zone.size == 0:
        return None

    zh, zw = zone.shape[:2]
    gray = cv2.cvtColor(zone, cv2.COLOR_BGR2GRAY) if len(zone.shape) == 3 else zone
    _, bw = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    quads = {
        'albastru': bw[:zh // 2, :zw // 2],
        'verde':    bw[:zh // 2, zw // 2:],
        'rosu':     bw[zh // 2:, :zw // 2],
        'galben':   bw[zh // 2:, zw // 2:],
    }

    scores = {}
    for color, quad in quads.items():
        if quad.size == 0:
            scores[color] = 0.0
            continue
        qh, qw = quad.shape[:2]
        ins = max(4, int(min(qh, qw) * 0.15))
        inner = quad[ins:qh-ins, ins:qw-ins]
        if inner.size == 0:
            scores[color] = 0.0
            continue
        scores[color] = float(np.count_nonzero(inner)) / inner.size

    best_color = max(scores, key=scores.get)
    best_score = scores[best_color]

    logging.info(f'detect_fsgc_version scores: {scores}  best={best_color}({best_score:.3f})')

    if best_score < FSGC_VER_MARK_THRESH:
        logging.warning('detect_fsgc_version: niciun cadran suficient de marcat')
        return None
    return best_color

def detect_fpse_version(image):
    h, w = image.shape[:2]

    yr1 = int(h * FPSE_VER_Y[0])
    yr2 = int(h * FPSE_VER_Y[1])
    alb_x1, alb_x2 = int(w * FPSE_ALB_X[0]), int(w * FPSE_ALB_X[1])
    ver_x1, ver_x2 = int(w * FPSE_VER_X[0]), int(w * FPSE_VER_X[1])

    hsv  = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    blue = cv2.inRange(hsv,
                       np.array([85, 40, 40]),
                       np.array([150, 255, 245]))

    alb_r   = blue[yr1:yr2, alb_x1:alb_x2]
    ver_r   = blue[yr1:yr2, ver_x1:ver_x2]

    alb_pct = cv2.countNonZero(alb_r) / max(1, alb_r.size) * 100
    ver_pct = cv2.countNonZero(ver_r) / max(1, ver_r.size) * 100

    logging.info(f'detect_fpse_version: albastru={alb_pct:.2f}%  verde={ver_pct:.2f}%')

    if alb_pct > FPSE_VER_THRESH and ver_pct > FPSE_VER_THRESH:
        result = 'albastru' if alb_pct >= ver_pct else 'verde'
        logging.warning(f'detect_fpse_version: ambele bifate → ales {result}')
        return result
    if alb_pct > FPSE_VER_THRESH:
        return 'albastru'
    if ver_pct > FPSE_VER_THRESH:
        return 'verde'

    logging.warning('detect_fpse_version: nicio casetă suficient de bifată')
    return None

def detect_fsas_version(image):
    h, w = image.shape[:2]

    yr1 = int(h * FSAS_VER_Y[0])
    yr2 = int(h * FSAS_VER_Y[1])
    r1_x1, r1_x2 = int(w * FSAS_R1_X[0]), int(w * FSAS_R1_X[1])
    r2_x1, r2_x2 = int(w * FSAS_R2_X[0]), int(w * FSAS_R2_X[1])

    hsv  = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    blue = cv2.inRange(hsv,
                       np.array([85, 40, 40]),
                       np.array([150, 255, 245]))

    r1_r = blue[yr1:yr2, r1_x1:r1_x2]
    r2_r = blue[yr1:yr2, r2_x1:r2_x2]

    r1_pct = cv2.countNonZero(r1_r) / max(1, r1_r.size) * 100
    r2_pct = cv2.countNonZero(r2_r) / max(1, r2_r.size) * 100

    logging.info(f'detect_fsas_version: randul1={r1_pct:.2f}%  randul2={r2_pct:.2f}%')

    if r1_pct > FSAS_VER_THRESH and r2_pct > FSAS_VER_THRESH:
        result = 'randul1' if r1_pct >= r2_pct else 'randul2'
        logging.warning(f'detect_fsas_version: ambele bifate → ales {result}')
        return result
    if r1_pct > FSAS_VER_THRESH:
        return 'randul1'
    if r2_pct > FSAS_VER_THRESH:
        return 'randul2'

    logging.warning('detect_fsas_version: nicio casetă suficient de bifată')
    return None

def get_config_for_key(key_name):
    kl = key_name.lower()
    if 'fsas' in kl or 'ealr' in kl:
        return {
            'questions_per_section': [20, 15, 10],
            'skip_rows': 2,
            'row_start_offset': 2,
            'total_questions': 45,
            'column_nudge_x': FSAS_COLUMN_NUDGE_X,
        }
    if 'finalizare' in kl or 'finlizare' in kl:
        return {
            'questions_per_section': [10],
            'skip_rows': 3,
            'row_start_offset': 2,
            'total_questions': 10,
            'options_per_question': 4,
        }
    is_fpse3_var = (
        ('fpse3' in kl)
        or ('fpse' in kl and ('3 rasp' in kl or '3rasp' in kl or '3 răsp' in kl))
        or ('fpse' in kl and ('albastru' in kl or 'verde' in kl)
            and not any(t in kl for t in ('4rasp', '4 rasp', '4 răsp')))
    )
    if 'fpse' in kl and ('albastru' in kl or 'verde' in kl):
        if key_name in CORRECT_ANSWERS:
            n = len(CORRECT_ANSWERS[key_name])
            if n <= 39:
                return {
                    'questions_per_section': [12, 12, 12],
                    'skip_rows': 2,
                    'row_start_offset': 2,
                    'total_questions': n,
                    'options_per_question': 3,
                }
            else:
                return {
                    'questions_per_section': [15, 15, 15],
                    'skip_rows': 2,
                    'row_start_offset': 2,
                    'total_questions': n,
                    'options_per_question': 4,
                }
    is_fpse_3opt = (
        'fpse3' in kl
        or ('fpse' in kl and ('3 rasp' in kl or '3rasp' in kl or '3 răsp' in kl))
    )
    if is_fpse_3opt:
        return {
            'questions_per_section': [12, 12, 12],
            'skip_rows': 2,
            'row_start_offset': 2,
            'total_questions': 36,
            'options_per_question': 3,
        }
    if any(t in kl for t in ('fsgc', 'fpse', 'drept')):
        return {
            'questions_per_section': [15, 15, 15],
            'skip_rows': 2,
            'row_start_offset': 2,
            'total_questions': 45,
            'options_per_question': 4,
        }
    if key_name in CORRECT_ANSWERS:
        n = len(CORRECT_ANSWERS[key_name])
        if n == 45:
            return {
                'questions_per_section': [20, 15, 10],
                'skip_rows': 2,
                'row_start_offset': 2,
                'total_questions': 45,
            }
        for secs in [3, 2, 4]:
            if n % secs == 0:
                qps = n // secs
                return {
                    'questions_per_section': [qps] * secs,
                    'skip_rows': 3 if qps <= 15 else (2 if qps <= 18 else 0),
                    'total_questions': n,
                }
    return {
        'questions_per_section': [15, 15, 15],
        'skip_rows': 3,
        'total_questions': 45,
    }
    kl = key_name.lower()
    if 'fsas' in kl or 'ealr' in kl:
        return {
            'questions_per_section': [20, 15, 10],
            'skip_rows': 2,
            'row_start_offset': 2,
            'total_questions': 45,
            'column_nudge_x': FSAS_COLUMN_NUDGE_X,
        }
    if 'finalizare' in kl or 'finlizare' in kl:
        return {
            'questions_per_section': [10],
            'skip_rows': 3,
            'row_start_offset': 2,
            'total_questions': 10,
            'options_per_question': 4,
        }    
    is_fpse_3opt = (
        'fpse3' in kl
        or ('fpse' in kl and ('3 rasp' in kl or '3rasp' in kl or '3 răsp' in kl))
    )
    if is_fpse_3opt:
        return {
            'questions_per_section': [12, 12, 12],
            'skip_rows': 2,
            'row_start_offset': 2,
            'total_questions': 36,
            'options_per_question': 3,
            }
    if any(t in kl for t in ('fsgc', 'fpse', 'drept')):
        return {
            'questions_per_section': [15, 15, 15],
            'skip_rows': 2,
            'row_start_offset': 2,
            'total_questions': 45,
            'options_per_question': 4,
        }
    if key_name in CORRECT_ANSWERS:
        n = len(CORRECT_ANSWERS[key_name])
        if n == 45:
            return {
                'questions_per_section': [20, 15, 10],
                'skip_rows': 2,
                'row_start_offset': 2,
                'total_questions': 45,
            }
        for secs in [3, 2, 4]:
            if n % secs == 0:
                qps = n // secs
                return {
                    'questions_per_section': [qps] * secs,
                    'skip_rows': 3 if qps <= 15 else (2 if qps <= 18 else 0),
                    'total_questions': n,
                }
    return {
        'questions_per_section': [15, 15, 15],
        'skip_rows': 3,
        'total_questions': 45,
    }

def make_roi_key(section_idx, question_num):
    return f"{chr(ord('A') + section_idx)}{question_num:02d}"

def parse_roi_key(roi_key):
    if not isinstance(roi_key, str) or len(roi_key) != 3:
        return None
    try:
        return ord(roi_key[0].upper()) - ord('A'), int(roi_key[1:])
    except ValueError:
        return None

def map_index_to_roi_key(index, sheet_cfg):
    qps  = sheet_cfg['questions_per_section']
    base = 0
    for si, n in enumerate(qps):
        if base < index <= base + n:
            return make_roi_key(si, index - base)
        base += n
    return None

def map_roi_key_to_index(roi_key, sheet_cfg):
    parsed = parse_roi_key(roi_key)
    if parsed is None:
        return None
    si, num = parsed
    qps = sheet_cfg['questions_per_section']
    if si >= len(qps) or not (1 <= num <= qps[si]):
        return None
    return sum(qps[:si]) + num

def _detect_rotation_tesseract(image):
    import pytesseract
    from PIL import Image as PILImage
    h, w  = image.shape[:2]
    scale = min(1.0, 1200 / max(h, w))
    small = cv2.resize(image, (int(w * scale), int(h * scale)),
                       interpolation=cv2.INTER_AREA)
    gray  = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    pil   = PILImage.fromarray(gray)
    osd  = pytesseract.image_to_osd(pil, output_type=pytesseract.Output.DICT)
    angle = int(osd.get('rotate', 0))
    conf  = float(osd.get('orientation_conf', 0))
    logging.info(f'Tesseract OSD: rotate={angle}°  conf={conf:.2f}')
    if conf < 1.5:
        logging.warning('OSD confidence prea mică — ignorăm rotația Tesseract')
        return 0
    return angle

def _detect_rotation_heuristic(image):
    h, w = image.shape[:2]

    def _h_line_score(img):
        ih, iw = img.shape[:2]
        gray   = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur   = cv2.GaussianBlur(gray, (5, 5), 0)
        _, bw  = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        kern   = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, iw // 15), 1))
        morph  = cv2.morphologyEx(bw, cv2.MORPH_OPEN, kern, iterations=1)
        proj   = np.sum(morph, axis=1).astype(float)
        zone   = proj[int(ih * 0.33): int(ih * 0.90)]
        thresh = zone.max() * 0.08 if zone.max() > 0 else 1
        lines  = np.where(zone > thresh)[0]
        if len(lines) < 2:
            return 0
        gaps   = [lines[i+1] - lines[i] for i in range(len(lines) - 1)]
        scale  = 2000 / ih
        score  = sum(1 for g in gaps if 35 / scale < g * scale < 85 / scale)
        return score

    score_0   = _h_line_score(image)
    rot180    = cv2.rotate(image, cv2.ROTATE_180)
    score_180 = _h_line_score(rot180)
    logging.info(f'Heuristic rotation: score_0={score_0}  score_180={score_180}')
    if score_180 > score_0 * 1.3:
        logging.info('Heuristic: imaginea e cu 180° — aplicăm rotire')
        return 180
    return 0

def _detect_rotation_angle(image):
    try:
        angle = _detect_rotation_tesseract(image)
        return angle
    except ImportError:
        logging.warning('pytesseract/Pillow nu sunt instalate — folosim heuristică')
    except Exception as e:
        logging.warning(f'Tesseract OSD eșuat ({e}) — folosim heuristică')
    return _detect_rotation_heuristic(image)

def _rotate_image(image, angle):
    if angle == 0:
        return image
    elif angle == 90:
        return cv2.rotate(image, cv2.ROTATE_90_COUNTERCLOCKWISE)
    elif angle == 180:
        return cv2.rotate(image, cv2.ROTATE_180)
    elif angle == 270:
        return cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    logging.warning(f'_rotate_image: unghi neașteptat {angle}° — fără rotire')
    return image

def _order_points(pts):
    pts  = np.array(pts, dtype='float32')
    rect = np.zeros((4, 2), dtype='float32')
    s    = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    rect[0] = pts[np.argmin(s)]
    rect[2] = pts[np.argmax(s)]
    rect[1] = pts[np.argmin(diff)]
    rect[3] = pts[np.argmax(diff)]
    return rect

def _four_point_transform(image, pts, tw, th):
    rect = _order_points(pts)
    dst  = np.array([[0,0],[tw-1,0],[tw-1,th-1],[0,th-1]], dtype='float32')
    return cv2.warpPerspective(image, cv2.getPerspectiveTransform(rect, dst), (tw, th))

def _find_sheet_contour(image):
    h, w    = image.shape[:2]
    gray    = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur    = cv2.GaussianBlur(gray, (5, 5), 0)
    min_area = h * w * 0.10

    def _try(binary):
        cnts, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(cnts, key=cv2.contourArea, reverse=True)[:10]:
            if cv2.contourArea(c) < min_area:
                break
            peri   = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) != 4:
                continue
            pts     = approx.reshape(4, 2).astype('float32')
            o       = _order_points(pts)
            aw = (np.linalg.norm(o[1]-o[0]) + np.linalg.norm(o[2]-o[3])) / 2
            ah = (np.linalg.norm(o[3]-o[0]) + np.linalg.norm(o[2]-o[1])) / 2
            if aw > 0 and 0.8 < ah / aw < 2.5:
                return pts
        return None

    for binary in [
        cv2.dilate(cv2.Canny(blur, 30, 100), np.ones((3,3), np.uint8)),
        cv2.dilate(cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                   cv2.THRESH_BINARY_INV, 21, 10), np.ones((3,3), np.uint8), iterations=2),
        cv2.dilate(cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1],
                   np.ones((5,5), np.uint8), iterations=2),
    ]:
        r = _try(binary)
        if r is not None:
            return r
    return None

def auto_align(image, target_h=2000):
    h, w = image.shape[:2]
    if AUTO_ROTATION_ENABLED:
        angle = _detect_rotation_angle(image)
        if angle != 0:
            logging.info(f'auto_align: corectare rotație {angle}°')
            image = _rotate_image(image, angle)
            h, w  = image.shape[:2]
    else:
        logging.info('auto_align: rotație automată dezactivată (AUTO_ROTATION_ENABLED=0)')
    tw   = round(target_h * w / h)
    pts  = _find_sheet_contour(image)
    if pts is not None:
        logging.info('auto_align: perspective warp')
        return _four_point_transform(image, pts, tw, target_h)
    logging.warning('auto_align: resize only (no sheet contour found)')
    return cv2.resize(image, (tw, target_h), interpolation=cv2.INTER_AREA)

def _cluster(vals, gap):
    if not list(vals):
        return []
    vals   = sorted(vals)
    groups = [[vals[0]]]
    for v in vals[1:]:
        if v - groups[-1][-1] > gap:
            groups.append([v])
        else:
            groups[-1].append(v)
    return [int(np.median(g)) for g in groups]

def _remove_sandwich_lines(lines):
    if len(lines) < 3:
        return lines
    gaps = [lines[i+1] - lines[i] for i in range(len(lines) - 1)]
    real  = sorted(g for g in gaps if g > 10)
    if not real:
        return lines
    col_est  = float(np.median(real[len(real) // 2:]))
    half_col = col_est * 0.6
    clean = [lines[0]]
    i = 1
    while i < len(lines):
        gap_before = lines[i] - lines[i - 1]
        gap_after = lines[i + 1] - lines[i] if i < len(lines) - 1 else 999
        if gap_before < half_col and gap_after < half_col:
            i += 1
            continue
        clean.append(lines[i])
        i += 1
    if len(clean) < len(lines):
        logging.info(f'_remove_sandwich_lines: {len(lines)} → {len(clean)} V lines')
    return clean

def _merge_close_v_lines(lines, min_gap=40):
    if len(lines) < 2:
        return lines
    out = [lines[0]]
    for x in lines[1:]:
        if x - out[-1] < min_gap:
            out[-1] = (out[-1] + x) // 2
        else:
            out.append(x)
    if len(out) < len(lines):
        logging.info(f'_merge_close_v_lines: {len(lines)} → {len(out)} V lines')
    return out

def detect_table_lines(image):
    h_img, w_img = image.shape[:2]
    enhanced = _enhance_contrast(image)
    gray_enh = cv2.cvtColor(enhanced, cv2.COLOR_BGR2GRAY)
    gray_raw = cv2.cvtColor(image,    cv2.COLOR_BGR2GRAY)

    gap_min = max(30, int(h_img * 0.017))
    gap_max = min(120, int(h_img * 0.055))

    def _binarize(gray):
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        _, bw1 = cv2.threshold(clahe.apply(gray), 0, 255,
                               cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        _, bw2 = cv2.threshold(gray, 0, 255,
                               cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        return bw1, bw2

    h_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w_img // 15), 1))
    v_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(20, h_img // 20)))

    def _h_lines_from(bw):
        morph = cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_kern, iterations=1)
        proj  = np.sum(morph, axis=1).astype(float)
        proj[:int(h_img * 0.33)] = 0
        if proj.max() == 0:
            return []
        return _cluster(np.where(proj > proj.max() * 0.08)[0],
                        max(4, h_img // 200))

    def _run_len(lines):
        if len(lines) < 2:
            return 0
        gaps = [lines[i + 1] - lines[i] for i in range(len(lines) - 1)]
        best = cur = 1
        for g in gaps:
            cur = (cur + 1) if gap_min < g < gap_max else 1
            best = max(best, cur)
        return best

    candidates = []
    for gray in (gray_enh, gray_raw):
        bw_clahe, bw_otsu = _binarize(gray)
        for bw in (bw_clahe, bw_otsu):
            hl = _h_lines_from(bw)
            candidates.append((_run_len(hl), hl, bw))

    candidates.sort(key=lambda x: x[0], reverse=True)
    _, h_lines, bw = candidates[0]
    logging.info(f'detect_table_lines: best run={candidates[0][0]}  '
                 f'gap_range=[{gap_min},{gap_max}]')

    v_morph = cv2.morphologyEx(bw, cv2.MORPH_OPEN, v_kern, iterations=1)
    v_proj  = np.sum(v_morph, axis=0).astype(float)
    v_px    = np.where(v_proj > v_proj.max() * 0.08)[0] if v_proj.max() > 0 else []
    v_lines = _cluster(v_px, max(4, w_img // 200))
    v_lines = _remove_sandwich_lines(v_lines)
    v_lines = _merge_close_v_lines(v_lines, 55)

    logging.info(f'detect_table_lines: {len(h_lines)} H  {len(v_lines)} V')
    return h_lines, v_lines

def _find_row_gap_and_table_lines(h_lines, img_height=None):
    if len(h_lines) < 3:
        return None
    ref_h   = img_height if img_height and img_height > 0 else 2000
    gap_min = max(25, int(ref_h * 0.016))
    gap_max = min(130, int(ref_h * 0.060))
    logging.info(f'_find_row_gap: img_h={ref_h}  gap_range=[{gap_min},{gap_max}]')

    gaps = [h_lines[i+1] - h_lines[i] for i in range(len(h_lines) - 1)]
    runs = []
    cur  = [h_lines[0]]
    for i, g in enumerate(gaps):
        if gap_min < g < gap_max:
            cur.append(h_lines[i+1])
        else:
            if len(cur) >= 3:
                runs.append(list(cur))
            cur = [h_lines[i+1]]
    if len(cur) >= 3:
        runs.append(cur)

    if not runs:
        logging.error('_find_row_gap: no consistent run found')
        return None

    def _run_score(run):
        n = len(run)
        return n * 10 - abs(n - 22) * 4 + (50 if n >= 20 else 0)

    best_run = max(runs, key=_run_score)
    run_gaps  = [best_run[i+1] - best_run[i] for i in range(len(best_run) - 1)]
    exact_gap = float(np.mean(run_gaps))
    logging.info(f'Row gap={exact_gap:.3f}px  run={len(best_run)} lines '
                 f'(picked from {len(runs)} runs)')

    rows_above = round((best_run[0] - h_lines[0]) / exact_gap)
    table_top  = best_run[0] - rows_above * exact_gap
    n_lines     = round((best_run[-1] - table_top) / exact_gap) + 1
    n_lines     = max(n_lines, len(best_run), 22)
    table_lines = [int(round(table_top + i * exact_gap)) for i in range(n_lines)]

    logging.info(f'Table: top={int(table_top)}  lines={len(table_lines)}  '
                 f'rows={len(table_lines)-1}')
    return exact_gap, table_lines

def _label_column_start_index(grp):
    if len(grp) < 5:
        return 0
    gaps = [grp[i + 1] - grp[i] for i in range(len(grp) - 1)]
    body = gaps[1:4] if len(gaps) >= 4 else gaps[1:]
    if not body:
        return 0
    med_body = float(np.median(body))
    if gaps[0] >= med_body * 1.15:
        return 1
    if len(gaps) >= 4 and gaps[0] >= float(np.mean(gaps[1:4])) * 1.12:
        return 1
    return 0

def _get_option_centers(grp):
    if len(grp) < 4:
        return None
    gaps     = [grp[i + 1] - grp[i] for i in range(len(grp) - 1)]
    opt_start = _label_column_start_index(grp)
    if len(grp) - 1 - opt_start >= 4:
        centers = [(grp[j] + grp[j + 1]) // 2
                   for j in range(opt_start, opt_start + 4)]
        return centers
    med_gap = float(np.median(gaps[opt_start:])) if opt_start < len(gaps) else float(np.median(gaps))
    centers = [(grp[j] + grp[j + 1]) // 2
               for j in range(opt_start, len(grp) - 1)]
    while len(centers) < 4:
        centers.append(int(centers[-1] + med_gap) if centers else grp[-1])
    return centers[:4]

def _fsas_columns_from_example_marks(image, sec, y0, y1, si, hh):
    cols = _3SEC_EXAMPLE_COLS.get(si)
    if not cols:
        return None
    c0, c1 = cols
    if c0 == c1:
        return None
    pad = 10
    x_l = max(0, int(sec['x_left']) - pad)
    x_r = min(image.shape[1], int(sec['x_right']) + pad)
    m0 = _fsas_black_mark_x(image, y0, x_l, x_r, hh)
    m1 = _fsas_black_mark_x(image, y1, x_l, x_r, hh)
    if m0 is None or m1 is None:
        return None
    dc = c1 - c0
    cw = (m1 - m0) / float(dc)
    if abs(cw) < 18 or abs(cw) > 110:
        logging.warning(f'FSAS sec {si}: pitch coloană {cw:.1f}px invalid')
        return None
    opt_xs = [int(round(m0 + (j - c0) * cw)) for j in range(4)]
    logging.info(f'FSAS sec {si}: coloane din exemple m0={m0} m1={m1} cw={cw:.1f} → {opt_xs}')
    return opt_xs

def _fsas_columns_from_projection(image, x_left, x_right, y_c, hh):
    y1 = max(0, int(y_c - hh))
    y2 = min(image.shape[0], int(y_c + hh))
    x0 = max(0, int(x_left))
    x1 = min(image.shape[1], int(x_right))
    band = image[y1:y2, x0:x1]
    if band.size == 0:
        return None
    gray = cv2.cvtColor(band, cv2.COLOR_BGR2GRAY)
    proj = np.sum(255 - gray, axis=0).astype(float)
    w    = len(proj)
    cut  = max(8, int(w * 0.16))
    proj[:cut] = 0
    if proj.max() <= 0:
        return None
    ans_w = w - cut
    cw    = ans_w / 4.0
    return [int(x0 + cut + (i + 0.5) * cw) for i in range(4)]

def _fsas_validate_and_fix_columns(image, sec, example_ys, hh):
    sec = dict(sec)
    opt_xs = list(sec.get('option_col_xs') or [])
    if len(opt_xs) < 4 or not example_ys:
        return sec
    y0 = example_ys[0]
    x_l, x_r = sec['x_left'], sec['x_right']
    sec_w = x_r - x_l
    if sec_w < 40:
        return sec
    if opt_xs[0] < x_l + sec_w * 0.22:
        fixed = _fsas_columns_from_projection(image, x_l, x_r, y0, hh)
        if fixed:
            logging.warning(f'FSAS col fix: opt_xs prea stânga {opt_xs} → {fixed}')
            sec['option_col_xs'] = fixed
            opt_xs = fixed
    si = sec.get('_sec_idx', 0)
    cols = _3SEC_EXAMPLE_COLS.get(si)
    if cols and len(example_ys) >= 2:
        c0, c1 = cols
        cw = int(np.median([opt_xs[i + 1] - opt_xs[i] for i in range(3)]))
        band = max(28, cw // 2)
        mx0 = _fsas_black_mark_x(image, y0, opt_xs[c0] - band, opt_xs[c0] + band, hh)
        if mx0 is None:
            full_mx = _fsas_black_mark_x(image, y0, x_l, x_r, hh)
            if full_mx is not None and full_mx < opt_xs[0]:
                fixed = _fsas_columns_from_projection(image, x_l, x_r, y0, hh)
                if fixed:
                    logging.warning(f'FSAS col reproj: mark @ {full_mx} vs opt {opt_xs} → {fixed}')
                    sec['option_col_xs'] = fixed
    return sec

def _label_col_strength(grp):
    if len(grp) < 3:
        return 0.0
    gaps = [grp[i+1]-grp[i] for i in range(len(grp)-1)]
    return gaps[0] / max(1.0, float(np.median(gaps[1:])))

def _valid_section_group(grp):
    if len(grp) < 4 or len(grp) > 7:
        return False
    gaps = [grp[i+1]-grp[i] for i in range(len(grp)-1)]
    return len(gaps) < 2 or gaps[0] >= float(np.median(gaps[1:])) * 0.9

def _split_oversized_group(grp):
    if len(grp) <= 7:
        return [grp]
    best, best_score, best_strength = None, -1, -1.0
    for split in range(3, len(grp) - 3):
        g1, g2   = grp[:split+1], grp[split+1:]
        v1       = _valid_section_group(g1)
        v2       = _valid_section_group(g2) or 4 <= len(g2) <= 7
        score    = int(v1) + int(v2)
        strength = _label_col_strength(g1) + _label_col_strength(g2)
        if score > best_score or (score == best_score and strength > best_strength):
            best_score, best_strength, best = score, strength, (g1, g2)
    if best:
        g1, g2 = best
        logging.info(f'_split_oversized_group: {len(grp)} lines → {len(g1)}+{len(g2)}')
        return _split_oversized_group(list(g1)) + _split_oversized_group(list(g2))
    return [grp]

def _sections_from_3col_split(v_lines):
    merged = _merge_close_v_lines(v_lines, 40)
    n = len(merged)
    if n < 12:
        return []
    gaps = [(merged[i + 1] - merged[i], i) for i in range(n - 1)]
    lo, hi = max(1, int(n * 0.12)), min(n - 2, int(n * 0.88))
    best_pair, best_score = None, -999
    for i in range(lo, hi):
        for j in range(i + 1, hi + 1):
            g1, g2, g3 = merged[:i + 1], merged[i + 1:j + 1], merged[j + 1:]
            sizes = [len(g1), len(g2), len(g3)]
            if not all(4 <= s <= 8 for s in sizes):
                continue
            gi, gj = gaps[i][0], gaps[j][0]
            if gi < 50 or gj < 50:
                continue
            score = 100 - sum(abs(s - 6) for s in sizes) - abs(gi - gj)
            if score > best_score:
                best_score, best_pair = score, (i, j)
    if best_pair is None:
        cands = sorted([(g, idx) for g, idx in gaps if lo <= idx <= hi and g >= 50],
                       reverse=True)
        if len(cands) >= 2:
            best_pair = tuple(sorted([cands[0][1], cands[1][1]]))
        else:
            return []
    i, j = best_pair
    groups = [merged[:i + 1], merged[i + 1:j + 1], merged[j + 1:]]
    logging.info(f'_sections_from_3col_split: sizes={[len(g) for g in groups]}')
    sections = []
    for grp in groups:
        if len(grp) < 3:
            continue
        opt_xs = _get_option_centers(grp)
        if not opt_xs:
            continue
        gaps_grp = [grp[k + 1] - grp[k] for k in range(len(grp) - 1)]
        sections.append({
            'x_left': grp[0], 'x_right': grp[-1],
            'option_col_xs': opt_xs,
            'cell_w': max(20, int(np.median(gaps_grp))),
            '_sec_idx': len(sections),
            'v_lines': list(grp),
        })
    return sections if len(sections) == 3 else []

def _find_sections(v_lines):
    if len(v_lines) < 4:
        return []
    v_lines = _merge_close_v_lines(v_lines, 40)
    v_gaps = [v_lines[i+1]-v_lines[i] for i in range(len(v_lines)-1)]
    real_gaps = sorted(g for g in v_gaps if g > 35)
    if len(real_gaps) >= 2:
        jumps     = [(real_gaps[i+1]-real_gaps[i], i) for i in range(len(real_gaps)-1)]
        max_jump_size, max_jump_idx = max(jumps)
        if max_jump_size >= 6:
            thresh = (real_gaps[max_jump_idx] + real_gaps[max_jump_idx+1]) / 2.0
        else:
            sg     = sorted(g for g in v_gaps if g > 35)
            intra  = float(np.median(sg[:max(1, int(len(sg) * 0.6))]))
            thresh = intra * 1.4
    else:
        sg     = sorted(g for g in v_gaps if g > 35)
        intra  = float(np.median(sg[:max(1, int(len(sg) * 0.6))])) if sg else 60.0
        thresh = intra * 1.4

    logging.info(f'V sep_thresh={thresh:.1f}  gaps={v_gaps}')
    seps   = sorted({i for i, g in enumerate(v_gaps) if g > thresh or g >= 100})
    bounds = [0] + [s+1 for s in seps] + [len(v_lines)]
    raw    = [v_lines[bounds[i]:bounds[i+1]] for i in range(len(bounds)-1)]
    logging.info(f'V groups (raw): sizes={[len(g) for g in raw]}')

    groups = []
    for grp in raw:
        groups.extend(_split_oversized_group(list(grp)))
    if len(groups) != len(raw):
        logging.info(f'V groups (split): sizes={[len(g) for g in groups]}')

    sections = []
    for grp in groups:
        if len(grp) < 3:
            logging.warning(f'Skipping V group of {len(grp)} lines')
            continue
        opt_xs = _get_option_centers(grp)
        if opt_xs is None:
            continue
        gaps_grp = [grp[j+1]-grp[j] for j in range(len(grp)-1)]
        sections.append({
            'x_left'       : grp[0],
            'x_right'      : grp[-1],
            'option_col_xs': opt_xs,
            'cell_w'       : max(20, int(np.median(gaps_grp))),
            '_sec_idx'     : len(sections),
            'v_lines'      : list(grp),
        })

    if len(sections) != 3 and len(v_lines) >= 12:
        alt = _sections_from_3col_split(v_lines)
        if len(alt) == 3:
            logging.info('Sections: using 3-column split fallback')
            sections = alt

    logging.info(f'Sections detected: {len(sections)}')
    return sections

def _grid_hash(table_lines, v_lines):
    hmax = max(table_lines) if table_lines else 1
    wmax = max(v_lines)     if v_lines     else 1
    hn   = tuple(round(y / hmax * 100) for y in table_lines)
    vn   = tuple(round(x / wmax * 100) for x in v_lines)
    return hashlib.md5(str((hn, vn)).encode()).hexdigest()[:12]

def detect_grid(image):
    img_h = image.shape[0]
    h_lines_raw, v_lines = detect_table_lines(image)

    if len(h_lines_raw) < 3:
        logging.error('detect_grid: too few H lines')
        return None
    if len(v_lines) < 4:
        logging.error('detect_grid: too few V lines')
        return None

    result = _find_row_gap_and_table_lines(h_lines_raw, img_height=img_h)
    if result is None:
        return None
    exact_gap, table_lines = result

    sections = _find_sections(v_lines)
    if not sections:
        logging.error('detect_grid: no sections found')
        return None

    cell_h   = int(round(exact_gap))
    sections = [dict(s, cell_h=cell_h) for s in sections]
    gh     = _grid_hash(table_lines, v_lines)

    logging.info(f'Grid: hash={gh}  rows={len(table_lines)-1}  secs={len(sections)}  '
                 f'gap={exact_gap:.2f}px')
    for si, sec in enumerate(sections):
        logging.info(f'  Sec {si}: opt_xs={sec["option_col_xs"]}')

    return {
        'h_lines'    : table_lines,
        'sections'   : sections,
        'row_gap'    : exact_gap,
        'grid_hash'  : gh,
        'n_rows_raw' : len(table_lines) - 1,
        'v_lines_raw': v_lines,
        'img_w'      : image.shape[1],
    }

def load_sheet_configs():
    global SHEET_CONFIGS
    if os.path.exists(SHEET_CONFIGS_FILE):
        try:
            with open(SHEET_CONFIGS_FILE, 'r') as f:
                SHEET_CONFIGS = json.load(f)
            logging.info(f'Loaded {len(SHEET_CONFIGS)} sheet config(s)')
        except Exception as e:
            logging.error(f'load_sheet_configs: {e}')
            SHEET_CONFIGS = {}
    else:
        SHEET_CONFIGS = {}

def save_sheet_configs():
    try:
        with open(SHEET_CONFIGS_FILE, 'w') as f:
            json.dump(SHEET_CONFIGS, f, indent=2)
    except IOError as e:
        logging.error(f'save_sheet_configs: {e}')

def register_sheet_config(grid_hash, name, questions_per_section, skip_rows):
    SHEET_CONFIGS[grid_hash] = {
        'name'                 : name,
        'questions_per_section': list(questions_per_section),
        'skip_rows'            : int(skip_rows),
        'total_questions'      : sum(questions_per_section),
    }
    save_sheet_configs()
    logging.info(f'Registered "{name}" → hash {grid_hash}')

def _infer_sheet_cfg(grid):
    n_secs = len(grid['sections'])
    n_rows = grid['n_rows_raw']
    skip_rows = None
    for skip in (3, 2, 1, 0):
        q = n_rows - skip
        if q > 0 and q % 5 == 0 and 5 <= q <= 30:
            skip_rows = skip
            break
    if skip_rows is None:
        skip_rows = 1
    q_per = n_rows - skip_rows
    qps   = [max(0, q_per)] * n_secs
    cfg   = {
        'name'                 : f'auto_{n_secs}sec_{q_per}q',
        'questions_per_section': qps,
        'skip_rows'            : skip_rows,
        'total_questions'      : sum(qps),
    }
    logging.info(f'Inferred cfg: secs={n_secs}  skip={skip_rows}  '
                 f'qps={qps}  total={sum(qps)}')
    return cfg

def _normalise_sheet_cfg(cfg, grid):
    cfg = dict(cfg)
    if 'questions_per_section' not in cfg:
        if 'sections' in cfg:
            qps = [info['count'] for info in cfg['sections'].values()
                   if info.get('count', 0) > 0]
            cfg['questions_per_section'] = qps
            cfg['total_questions']       = sum(qps)
        else:
            return _infer_sheet_cfg(grid)
    n_rows   = grid['n_rows_raw']
    max_q    = max(cfg['questions_per_section'])
    skip     = cfg.get('skip_rows', 3)
    qps_fixed = cfg.get('questions_per_section') == [20, 15, 10]
    if not qps_fixed and n_rows - skip < max_q:
        inferred  = _infer_sheet_cfg(grid)
        new_skip  = inferred['skip_rows']
        logging.warning(f'skip_rows {skip}→{new_skip} '
                        f'(n_rows={n_rows}, max_q={max_q})')
        cfg['skip_rows'] = new_skip
    if 'total_questions' not in cfg:
        cfg['total_questions'] = sum(cfg['questions_per_section'])
    return cfg

def build_calibration_preview(image, grid, output_path=None, sheet_cfg=None):
    img = image.copy()
    h_img, w_img = img.shape[:2]
    hl = grid['h_lines']
    qps = sheet_cfg['questions_per_section'] if sheet_cfg else None
    all_centers = [(hl[i] + hl[i+1]) // 2 for i in range(len(hl) - 1)]
    max_q = max(qps) if qps else len(all_centers)
    answer_rows = all_centers[-max_q:] if len(all_centers) >= max_q else all_centers
    row_gap_half = int(grid['row_gap']) // 2
    for y in hl:
        cv2.line(img, (0, y), (w_img, y), (0, 200, 0), 1)
    for si, sec in enumerate(grid['sections']):
        label = chr(ord('A') + si)
        n_q = qps[si] if qps and si < len(qps) else len(answer_rows)
        n_q = min(n_q, len(answer_rows))
        y_top = answer_rows[0] - row_gap_half if answer_rows else 0
        y_bottom = answer_rows[n_q - 1] + row_gap_half if n_q > 0 else h_img
        y_bottom = min(y_bottom, h_img)
        cv2.line(img, (sec['x_left'],  y_top), (sec['x_left'],  y_bottom), (255, 100, 0), 1)
        cv2.line(img, (sec['x_right'], y_top), (sec['x_right'], y_bottom), (255, 100, 0), 1)
        for j, cx in enumerate(sec['option_col_xs']):
            cv2.line(img, (cx, y_top), (cx, y_bottom), (0, 100, 255), 1)
            cv2.putText(img, f'{label}{"ABCD"[j]}', (cx-12, y_top - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 100, 255), 1)
    for i in range(len(hl) - 1):
        cy = (hl[i] + hl[i+1]) // 2
        cv2.putText(img, str(i), (5, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (0, 180, 0), 1)
    info = (f"hash={grid['grid_hash']}  rows={grid['n_rows_raw']}  "
            f"secs={len(grid['sections'])}  gap={grid['row_gap']:.1f}px")
    cv2.putText(img, info, (10, h_img-10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 2)
    cv2.putText(img, info, (10, h_img-10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
    if output_path:
        out = img
        if out.shape[0] > 1400:
            sf  = 1400 / out.shape[0]
            out = cv2.resize(out, (int(out.shape[1] * sf), 1400))
        cv2.imwrite(output_path, out)
        logging.info(f'Preview saved: {output_path}')
    return img

def _get_col_centers_from_band(bw, x_start, x_end, h_img):
    band = bw[:, x_start:x_end]
    v_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(20, h_img // 20)))
    morph_v = cv2.morphologyEx(band, cv2.MORPH_OPEN, v_kern, iterations=1)
    proj_v = np.sum(morph_v, axis=0).astype(float)
    if proj_v.max() == 0:
        return None

    v_local = _cluster(np.where(proj_v > proj_v.max() * 0.08)[0], 8)

    merged = []
    for x in v_local:
        if merged and x - merged[-1] < 35:
            merged[-1] = (merged[-1] + x) // 2
        else:
            merged.append(x)

    if len(merged) < 5:
        return None

    merged_global = [x + x_start for x in merged]
    gaps = [merged_global[i + 1] - merged_global[i] for i in range(len(merged_global) - 1)]
    valid_gaps = [g for g in gaps if 40 < g < 100]
    if not valid_gaps:
        return None
    med = float(np.median(valid_gaps))

    skip = 0
    for g in gaps:
        if g > med * 1.1:
            skip += 1
        else:
            break

    all_centers = [(merged_global[i] + merged_global[i + 1]) // 2
                   for i in range(len(merged_global) - 1)]
    result = all_centers[skip:skip + 4]

    if len(result) < 4:
        cg = int(med)
        while len(result) < 4:
            result.append(result[-1] + cg)

    logging.info(f'_get_col_centers_from_band [{x_start}..{x_end}]: '
                 f'skip={skip}  med={med:.1f}  centers={result[:4]}')
    return result[:4]

def build_rois_dynamic_fsas(image, sheet_cfg, answer_key=None):
    qps = sheet_cfg.get('questions_per_section', [20, 15, 10])
    h_img, w_img = image.shape[:2]

    enh  = _enhance_contrast(image)
    gray = cv2.cvtColor(enh, cv2.COLOR_BGR2GRAY)
    clahe_obj = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    _, bw = cv2.threshold(clahe_obj.apply(gray), 0, 255,
                          cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    h_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (max(20, w_img // 15), 1))
    morph_h = cv2.morphologyEx(bw, cv2.MORPH_OPEN, h_kern, iterations=1)
    proj_h = np.sum(morph_h, axis=1).astype(float)
    proj_h[:int(h_img * 0.33)] = 0
    h_lines_raw = _cluster(
        np.where(proj_h > proj_h.max() * 0.08)[0], max(4, h_img // 200)
    ) if proj_h.max() > 0 else []

    if len(h_lines_raw) < 5:
        logging.warning('build_rois_dynamic_fsas: prea puține H-lines → fallback hardcodat')
        return build_rois_hardcoded_fsas(sheet_cfg)

    centers_h = [(h_lines_raw[i] + h_lines_raw[i + 1]) // 2
                 for i in range(len(h_lines_raw) - 1)]
    gaps_h = [h_lines_raw[i + 1] - h_lines_raw[i] for i in range(len(h_lines_raw) - 1)]

    valid_gaps = [g for g in gaps_h if 45 < g < 65]
    if not valid_gaps:
        logging.warning('build_rois_dynamic_fsas: niciun gap consistent → fallback hardcodat')
        return build_rois_hardcoded_fsas(sheet_cfg)

    row_gap = int(np.median(valid_gaps))

    first_consistent_idx = next(
        (i for i in range(len(gaps_h)-2) if all(45 < gaps_h[i+j] < 70 for j in range(3))),
        next((i for i, g in enumerate(gaps_h) if 45 < g < 65), 3)
    )
    is_fsgc = any(t in (answer_key or '').lower() for t in ('fsgc', 'fpse', 'drept'))

    if is_fsgc:
        answer_start_idx = first_consistent_idx
    else:
        gap_before = gaps_h[first_consistent_idx - 1] if first_consistent_idx > 0 else 0
        if 45 < gap_before < 70:
            answer_start_idx = first_consistent_idx
        else:
            answer_start_idx = first_consistent_idx + 1

    if answer_start_idx >= len(centers_h):
        answer_start_idx = first_consistent_idx
    first_row_y = centers_h[answer_start_idx]

    logging.info(f'build_rois_dynamic_fsas: row_gap={row_gap}  '
                 f'first_row_y={first_row_y}  (idx={answer_start_idx})')

    hh = max(17, int(row_gap * 0.38))
    hw = max(20, int(row_gap * 0.48))
    col_xs_per_sec = {}
    for si, (p0, p1) in enumerate(_FSAS_SEC_BANDS_PCT):
        x0 = int(w_img * p0)
        x1 = int(w_img * p1)
        cx = _get_col_centers_from_band(bw, x0, x1, h_img)
        if cx:
            col_xs_per_sec[si] = cx
        else:
            logging.warning(f'build_rois_dynamic_fsas: Sec {si} — detecție eșuată, '
                            f'folosim fallback uniform')
            sec_w = x1 - x0
            label_w = int(sec_w * 0.17)
            ans_w = (sec_w - label_w) / 4.0
            col_xs_per_sec[si] = [int(x0 + label_w + (j + 0.5) * ans_w) for j in range(4)]
    MIN_INTER_SEC_GAP = 60

    for si in range(len(_FSAS_SEC_BANDS_PCT) - 1):
        cx_cur  = col_xs_per_sec.get(si)
        cx_next = col_xs_per_sec.get(si + 1)
        if not cx_cur or not cx_next:
            continue
        gap = cx_next[0] - cx_cur[-1]
        logging.info(f'build_rois_dynamic_fsas: gap inter-sec {si}→{si+1} = {gap}px '
                    f'(min={MIN_INTER_SEC_GAP})')
        if gap < MIN_INTER_SEC_GAP:
            logging.warning(f'build_rois_dynamic_fsas: gap prea mic ({gap}px) între '
                            f'sec {si} și {si+1} → fallback hardcodat')
            return build_rois_hardcoded_fsas(sheet_cfg)
    MIN_INTERNAL_GAP = 30
    MAX_INTERNAL_GAP = 100

    for si, cx in col_xs_per_sec.items():
        if not cx or len(cx) < 4:
            continue
        internal_gaps = [cx[j+1] - cx[j] for j in range(3)]
        if min(internal_gaps) < MIN_INTERNAL_GAP or max(internal_gaps) > MAX_INTERNAL_GAP:
            logging.warning(f'build_rois_dynamic_fsas: gap-uri interne invalide '
                            f'sec {si}: {internal_gaps} → fallback hardcodat')
            return build_rois_hardcoded_fsas(sheet_cfg)
    rois    = {}
    overall = 1
    for si in range(min(len(qps), 3)):
        col_xs = col_xs_per_sec[si]
        n_q    = qps[si]
        logging.info(f'build_rois_dynamic_fsas: Sec {si} col_xs={col_xs}  '
                     f'n_q={n_q}  hw={hw}  hh={hh}')
        for q in range(n_q):
            rk = make_roi_key(si, q + 1)
            cy = first_row_y + q * row_gap
            rois[rk] = {'index': overall, 'options': {}}
            for j, opt in enumerate('ABCD'):
                cx = col_xs[j] + (3 if si == 0 else 0)
                rois[rk]['options'][opt] = (cx - hw, cy - hh, cx + hw, cy + hh)
            overall += 1

    logging.info(f'build_rois_dynamic_fsas: {len(rois)} ROIs  '
                 f'first_row_y={first_row_y}  row_gap={row_gap}')
    mdcfg = get_mark_detection_config(answer_key or '')
    if not is_fsgc:
        rois = _check_and_shift_rois(rois, image, row_gap, sheet_cfg, mdcfg)

    return rois

def build_rois_hardcoded_fsas(sheet_cfg):
    hc      = FSAS_HARDCODED
    qps     = sheet_cfg.get('questions_per_section', [20, 15, 10])
    first_y = hc['first_row_y']
    gap_y   = hc['row_gap_y']
    col_gap = hc['col_gap_x']
    hw      = hc['hw']
    hh      = hc['hh']
    starts  = [hc['sec_A_start_x'], hc['sec_B_start_x'], hc['sec_C_start_x']]
    all_cols = [[s + j * col_gap for j in range(4)] for s in starts]

    rois    = {}
    overall = 1
    for si in range(min(len(qps), 3)):
        col_xs = all_cols[si]
        n_q    = qps[si]
        for q in range(n_q):
            rk = make_roi_key(si, q + 1)
            cy = first_y + q * gap_y
            y1, y2 = cy - hh, cy + hh
            rois[rk] = {'index': overall, 'options': {}}
            for j, opt in enumerate('ABCD'):
                cx = col_xs[j]
                rois[rk]['options'][opt] = (cx - hw, y1, cx + hw, y2)
            overall += 1

    logging.info(f'build_rois_hardcoded_fsas (fallback): {len(rois)} ROIs')
    return rois

def _manual_row_rules(answer_key, sheet_cfg):
    kl = (answer_key or '').lower()
    skip = int(sheet_cfg.get('skip_rows', 2) or 0)
    offset = int(sheet_cfg.get('row_start_offset', 0) or 0)
    if 'fsas' in kl or 'fsgc' in kl or 'fpse' in kl:
        return skip, 2, False
    return skip, offset, bool(sheet_cfg.get('no_extrapolate', False))

def _row_pitch_px(centers, row_gap):
    pitch = int(round(float(row_gap or 0)))
    if len(centers) >= 2:
        gaps = [centers[i + 1] - centers[i] for i in range(len(centers) - 1)]
        pitch = max(10, int(round(float(np.median(gaps)))))
    return pitch

def _fsas_black_mark_x(image, y_c, x0, x1, hh):
    y1_p = max(0, int(y_c - hh))
    y2_p = min(image.shape[0], int(y_c + hh))
    x0_p = max(0, int(x0))
    x1_p = min(image.shape[1], int(x1))
    crop = image[y1_p:y2_p, x0_p:x1_p]
    if crop.size == 0:
        return None
    gray_raw = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    clahe    = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(4, 4))
    gray     = clahe.apply(gray_raw)
    hsv    = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    h_ch, s_ch, v_ch = cv2.split(hsv)
    dark = (gray < 120) & (s_ch < 80)
    blue = (h_ch > 85) & (h_ch < 145) & (s_ch > 35)
    mask = (dark & ~blue).astype(np.uint8) * 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    if cv2.countNonZero(mask) < 20:
        return None
    M = cv2.moments(mask)
    if not M['m00']:
        return None
    return int(M['m10'] / M['m00']) + x0_p

def _3sec_rows_from_examples(all_centers, max_q, row_gap):
    pitch = _row_pitch_px(all_centers, row_gap)
    if len(all_centers) >= 3:
        gaps = [all_centers[i + 1] - all_centers[i]
                for i in range(min(len(all_centers) - 1, 8))]
        if gaps:
            pitch = max(10, int(round(float(np.median(gaps)))))
    rows = []
    for k in range(max_q):
        ci = k + 2
        if ci < len(all_centers):
            rows.append(all_centers[ci])
        elif rows:
            rows.append(rows[-1] + pitch)
        elif len(all_centers) >= 3:
            rows.append(all_centers[2] + k * pitch)
    return rows[:max_q]

def _3sec_calibrate_sections(image, sections, example_ys, hh):
    if len(example_ys) < 2:
        return sections
    y0, y1 = example_ys[0], example_ys[1]
    out = []
    for si, sec in enumerate(sections):
        sec = dict(sec)
        sec_w = max(1, sec['x_right'] - sec['x_left'])
        derived = _fsas_columns_from_example_marks(image, sec, y0, y1, si, hh)
        if derived:
            span = derived[-1] - derived[0]
            if span >= sec_w * 0.45:
                sec['option_col_xs'] = derived
                out.append(sec)
                continue
            logging.warning(f'3sec sec {si}: derived span {span}px < 45% of sec_w {sec_w}px')
            derived = None
        opt_xs = list(sec['option_col_xs'])
        span_orig = (opt_xs[-1] - opt_xs[0]) if len(opt_xs) >= 2 else 0
        if span_orig < sec_w * 0.40:
            proj = _fsas_columns_from_projection(
                image, sec['x_left'], sec['x_right'], (y0 + y1) // 2, hh)
            if proj:
                logging.warning(f'3sec sec {si}: opt_xs span {span_orig}px < 40% → proiecție')
                sec['option_col_xs'] = proj
                out.append(sec)
                continue
        cols = _3SEC_EXAMPLE_COLS.get(si)
        if not cols:
            out.append(sec)
            continue
        c0, c1 = cols
        cw = int(np.median([opt_xs[i + 1] - opt_xs[i] for i in range(len(opt_xs) - 1)]))
        band = max(28, cw // 2)
        mx0 = _fsas_black_mark_x(image, y0, opt_xs[c0] - band, opt_xs[c0] + band, hh)
        mx1 = _fsas_black_mark_x(image, y1, opt_xs[c1] - band, opt_xs[c1] + band, hh)
        shifts = []
        if mx0 is not None:
            shifts.append(mx0 - opt_xs[c0])
        if mx1 is not None:
            shifts.append(mx1 - opt_xs[c1])
        if shifts:
            shift = int(round(float(np.median(shifts))))
            if abs(shift) <= 80:
                sec['option_col_xs'] = [x + shift for x in opt_xs]
                logging.info(f'3sec sec {si}: shift {shift}px → {sec["option_col_xs"]}')
        out.append(sec)
    return out

def _compute_3sec_columns(grid, n_secs=3, n_opts=4):
    img_w    = grid.get('img_w', 2000)
    cell_h   = int(round(grid.get('row_gap', 50)))
    if grid.get('sections'):
        cell_h = grid['sections'][0].get('cell_h', cell_h)
    v_raw = list(grid.get('v_lines_raw', []))
    if not v_raw:
        for sec in grid.get('sections', []):
            v_raw.extend(sec.get('v_lines', [sec['x_left'], sec['x_right']]))
    v_raw = sorted(set(v_raw))
    edge = max(30, int(img_w * 0.05))
    v_filt = [x for x in v_raw if edge <= x <= img_w - edge]
    if len(v_filt) < 6:
        v_filt = v_raw
    if len(v_filt) < 4:
        return None
    x_min = v_filt[0]
    x_max = v_filt[-1]
    total_w = x_max - x_min
    if total_w < 100:
        return None
    sec_w = total_w / n_secs
    sections = []
    for si in range(n_secs):
        x_left  = int(x_min + si * sec_w)
        x_right = int(x_min + (si + 1) * sec_w)
        sw      = x_right - x_left
        label_w   = int(sw * 0.14)
        ans_start = x_left + label_w
        ans_w     = (x_right - ans_start) / float(n_opts)
        opt_xs    = [int(ans_start + (j + 0.5) * ans_w) for j in range(n_opts)]
        sections.append({
            'x_left'       : x_left,
            'x_right'      : x_right,
            'option_col_xs': opt_xs,
            'cell_h'       : cell_h,
            'cell_w'       : int(sw / (n_opts + 1)),
            '_sec_idx'     : si,
            'v_lines'      : [x_left, x_right],
        })
    logging.info(f'_compute_3sec_columns: img_w={img_w}  v_range=[{x_min},{x_max}]  '
                 f'sec_w={sec_w:.0f}  edge_filter={edge}px')
    return sections

def build_rois(grid, sheet_cfg, image=None, answer_key=None):
    qps      = sheet_cfg['questions_per_section']
    sections = grid['sections']
    hl       = grid['h_lines']
    n_secs   = min(len(qps), len(sections))
    row_gap  = float(grid.get('row_gap', 50))

    kl = (answer_key or '').lower()
    is_known_3sec = 'fsas' in kl or 'ealr' in kl

    if is_known_3sec:
        if image is not None:
            logging.info('build_rois: FSAS/EALR → build_rois_dynamic_fsas')
            return build_rois_dynamic_fsas(image, sheet_cfg, answer_key=answer_key)
        else:
            logging.warning('build_rois: FSAS/EALR fără imagine → fallback hardcodat')
            return build_rois_hardcoded_fsas(sheet_cfg)

    n_opts_cfg = int(sheet_cfg.get('options_per_question', 4))
    is_fpse3 = (
        n_opts_cfg == 3
        or 'fpse3' in kl
        or ('fpse' in kl and ('3 rasp' in kl or '3rasp' in kl or '3 răsp' in kl))
    )
    is_fsgc = any(t in kl for t in ('fsgc', 'fpse', 'drept')) and not is_fpse3
    fpse3_trust_vlines = False
    if is_fpse3:
        fpse3_trust_vlines = len(sections) >= len(qps)
        for sec in sections[:len(qps)]:
            xs = list(sec.get('option_col_xs', []))[:3]
            if len(xs) < 3:
                fpse3_trust_vlines = False
                break
            g = [xs[i + 1] - xs[i] for i in range(2)]
            if min(g) < 30 or max(g) > 100 or max(g) > min(g) * 1.5:
                fpse3_trust_vlines = False
                break
        if fpse3_trust_vlines:
            logging.info('build_rois: FPSE3 (3 opts) → opt_xs din V-lines detectate (grid)')
        else:
            logging.info('build_rois: FPSE3 (3 opts) → _compute_3sec_columns standard pipeline')
            computed = _compute_3sec_columns(grid, n_secs=len(qps), n_opts=3)
            if computed:
                sections = computed
                n_secs   = min(len(qps), len(sections))
    if is_fsgc:
        if image is not None:
            logging.info('build_rois: FSGC → build_rois_dynamic_fsas')
            return build_rois_dynamic_fsas(image, sheet_cfg, answer_key=answer_key)
        computed = _compute_3sec_columns(grid, n_secs=len(qps), n_opts=int(sheet_cfg.get('options_per_question', 4)))
        if computed:
            sections = computed
            n_secs   = min(len(qps), len(sections))
            logging.info('build_rois: secțiuni recalculate cu _compute_3sec_columns')

    all_centers = [(hl[i] + hl[i + 1]) // 2 for i in range(len(hl) - 1)]
    skip        = int(sheet_cfg.get('skip_rows', 2))
    if skip >= len(all_centers):
        skip = 0

    answer_rows = list(all_centers[skip:])
    max_q       = max(qps)

    if fpse3_trust_vlines and image is not None:
        hh_probe = max(4, int(row_gap * 0.42))
        hw_probe = 26
        _gray  = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        _hsv   = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
        _h, _s, _v = cv2.split(_hsv)
        _black = ((_gray < 120) & (_s < 80)) & ~((_h > 85) & (_h < 145) & (_s > 35))

        def _fpse3_black_frac(y):
            best = 0.0
            for _sec in sections[:n_secs]:
                _xs = list(_sec.get('option_col_xs', []))[:3]
                for _cx in _xs:
                    cell = _black[max(0, y - hh_probe + 4): y + hh_probe - 4,
                                  max(0, _cx - hw_probe + 4): _cx + hw_probe - 4]
                    if cell.size:
                        best = max(best, float(cell.mean()))
            return best

        FPSE3_BLACK_FRAC_THRESH = 0.10
        bumps = 0
        while answer_rows and bumps < 4:
            bf = _fpse3_black_frac(answer_rows[0])
            if bf <= FPSE3_BLACK_FRAC_THRESH:
                break
            logging.info(f'build_rois FPSE3: rând exemplu/header la y={answer_rows[0]} '
                         f'(black_frac={bf:.3f}) → shift +1 rând')
            answer_rows.pop(0)
            bumps += 1

    if answer_rows and len(answer_rows) < max_q:
        pitch = max(10, int(round(row_gap)))
        while len(answer_rows) < max_q:
            answer_rows.append(answer_rows[-1] + pitch)
    answer_rows = answer_rows[:max_q]

    hh_roi = max(4, int(row_gap * 0.42))

    logging.info(f'build_rois: skip={skip}  answer_rows={len(answer_rows)}  '
                 f'max_q={max_q}  row_gap={row_gap:.1f}  hh={hh_roi}')

    n_opts  = int(sheet_cfg.get('options_per_question', 4))
    opt_letters = 'ABCD'[:n_opts]
    rois    = {}
    overall = 1

    for si in range(n_secs):
        sec     = sections[si]
        n_q     = qps[si]
        x_left  = int(sec['x_left'])
        x_right = int(sec['x_right'])
        sec_w   = max(1, x_right - x_left)

        opt_xs   = list(sec.get('option_col_xs', []))[:n_opts]
        col_span = (opt_xs[-1] - opt_xs[0]) if len(opt_xs) >= 2 else 0

        use_vlines = False
        if fpse3_trust_vlines:
            use_vlines = True
        elif len(opt_xs) >= n_opts and col_span >= sec_w * 0.42:
            min_gap = min(opt_xs[j + 1] - opt_xs[j] for j in range(n_opts - 1))
            if min_gap >= sec_w * 0.10:
                use_vlines = True

        if not use_vlines:
            label_w   = int(sec_w * 0.17)
            ans_start = x_left + label_w
            ans_w_f   = (x_right - ans_start) / float(n_opts)
            opt_xs    = [int(ans_start + (j + 0.5) * ans_w_f) for j in range(n_opts)]
            logging.warning(f'Sec {si}: V-lines invalide → fallback 17%+{n_opts}eq: {opt_xs}')
        else:
            logging.info(f'Sec {si}: opt_xs din V-lines OK: {opt_xs}')

        opt_col_w = int(np.median([opt_xs[j + 1] - opt_xs[j] for j in range(n_opts - 1)])) if n_opts > 1 else 30
        if fpse3_trust_vlines:
            hw = max(8, int(opt_col_w * 0.45))
        else:
            hw = max(8, int(opt_col_w * 0.47))

        n_rows = min(n_q, len(answer_rows))
        logging.info(f'Sec {si}: x=[{x_left},{x_right}]  opt_xs={opt_xs}  '
                     f'hw={hw}  hh={hh_roi}  n_q={n_q}→{n_rows}  n_opts={n_opts}')

        for q in range(n_rows):
            rk = make_roi_key(si, q + 1)
            cy = answer_rows[q]
            y1, y2 = cy - hh_roi, cy + hh_roi
            rois[rk] = {'index': overall, 'options': {}}
            for j, opt in enumerate(opt_letters):
                cx = opt_xs[j]
                rois[rk]['options'][opt] = (cx - hw, y1, cx + hw, y2)
            overall += 1

    logging.info(f'build_rois: {len(rois)} ROIs  '
                 f'(secs={[qps[i] for i in range(n_secs)]})')
    return rois

def detect_qr_student_id(image):
    attempts = [(image, 1)]
    h, w = image.shape[:2]
    if max(h, w) < 1500:
        attempts.append((cv2.resize(image, None, fx=2, fy=2,
                                    interpolation=cv2.INTER_CUBIC), 2))
    for img, scale in attempts:
        try:
            hits = pyzbar_decode(img)
            if hits:
                rect = hits[0].rect
                return (hits[0].data.decode('utf-8').strip(),
                        (int(rect.left/scale), int(rect.top/scale),
                         int((rect.left+rect.width)/scale),
                         int((rect.top+rect.height)/scale)))
        except Exception as e:
            logging.debug(f'pyzbar: {e}')
        qrd = cv2.QRCodeDetector()
        txt, pts, _ = qrd.detectAndDecode(img)
        if txt and pts is not None:
            pts = (pts / scale).astype(int)
            x1, y1 = pts[0][0]
            x2, y2 = pts[0][2]
            return txt.strip(), (int(x1), int(y1), int(x2), int(y2))
    logging.warning('QR not detected')
    return None, None

def load_correct_answers():
    global CORRECT_ANSWERS
    if not os.path.exists(ANSWER_KEYS_FILE):
        CORRECT_ANSWERS = {}
        return
    try:
        with open(ANSWER_KEYS_FILE, 'r') as f:
            loaded = json.load(f)
    except Exception as e:
        logging.error(f'load_correct_answers: {e}')
        CORRECT_ANSWERS = {}
        return
    validated = {}
    for kn, kd in loaded.items():
        if not isinstance(kd, dict):
            continue
        ok, vans = True, {}
        for q_str, ans_list in kd.items():
            try:
                q = int(q_str)
                assert q >= 1
            except Exception:
                ok = False
                break
            if not isinstance(ans_list, list) or not ans_list:
                ok = False
                break
            clean = []
            for a in ans_list:
                au = str(a).upper()
                if au not in VALID_ANSWER_OPTIONS:
                    ok = False
                    break
                clean.append(au)
            if not ok:
                break
            vans[q_str] = sorted(set(clean))
        if ok:
            validated[kn] = vans
    CORRECT_ANSWERS = validated
    logging.info(f'Loaded {len(CORRECT_ANSWERS)} answer key(s)')

def save_correct_answers():
    try:
        with open(ANSWER_KEYS_FILE, 'w') as f:
            json.dump({k: CORRECT_ANSWERS[k] for k in sorted(CORRECT_ANSWERS)},
                      f, indent=4, sort_keys=True)
    except IOError as e:
        logging.error(f'save_correct_answers: {e}')

def add_correct_answer_key(key_name, answers_input_string, sheet_cfg):
    global CORRECT_ANSWERS
    key_name = key_name.strip()
    if not key_name:
        return False, 'Name empty.'
    if not re.match(r'^[a-zA-Z0-9_\- .]+$', key_name):
        return False, 'Invalid characters in name.'
    total  = sheet_cfg['total_questions']
    parsed = {}
    found  = set()
    parts  = [p.strip() for p in
               answers_input_string.replace('\n', ';').replace('\r', '').split(';')
               if p.strip()]
    if not parts:
        return False, 'Empty answer string.'
    for part in parts:
        if ':' not in part:
            return False, f"Missing ':' in '{part}'"
        rs, ans_str = part.split(':', 1)
        rs  = rs.strip().upper()
        idx = map_roi_key_to_index(rs, sheet_cfg)
        if idx is None:
            return False, f"Unknown question '{rs}'"
        if idx in found:
            return False, f"Duplicate '{rs}'"
        found.add(idx)
        opts = [a.strip().upper() for a in ans_str.split(',') if a.strip()]
        if not opts:
            return False, f"No options for '{rs}'"
        for o in opts:
            if o not in VALID_ANSWER_OPTIONS:
                return False, f"Bad option '{o}'"
        parsed[str(idx)] = sorted(set(opts))
    if len(found) != total:
        miss  = sorted(set(range(1, total + 1)) - found)
        mkeys = [map_index_to_roi_key(n, sheet_cfg) or f'#{n}' for n in miss]
        return False, f"Found {len(found)}/{total}. Missing: {mkeys}"
    CORRECT_ANSWERS[key_name] = parsed
    save_correct_answers()
    return True, f"Saved '{key_name}' ({len(parsed)} questions)"

def delete_correct_answer_key(key_name):
    global CORRECT_ANSWERS
    if key_name in CORRECT_ANSWERS:
        del CORRECT_ANSWERS[key_name]
        save_correct_answers()
        return True
    return False

def analyze_exam_sheet(image_path, output_dir='static',
                       answer_key_name='DefaultKey',
                       sheet_cfg=None, custom_config=None):
    cfg_arg = custom_config if custom_config is not None else sheet_cfg
    fallback_id = os.path.splitext(os.path.basename(image_path))[0]

    if not os.path.exists(image_path):
        logging.error(f'Not found: {image_path}')
        return fallback_id, None, {}, None, None, answer_key_name

    raw = cv2.imread(image_path)
    if raw is None:
        logging.error(f'Cannot read: {image_path}')
        return fallback_id, None, {}, None, None, answer_key_name

    h0, w0 = raw.shape[:2]
    if w0 > h0 and 1.1 < w0 / h0 < 2.0:
        logging.info('Pre-rotate: landscape detected before auto_align')
        raw = cv2.rotate(raw, cv2.ROTATE_90_CLOCKWISE)

    image = auto_align(raw)
    img_h, img_w = image.shape[:2]
    logging.info(f'Aligned: {img_w}×{img_h}')

    ak_lower_check = (answer_key_name or '').lower()
    _fsgc_colors = ('albastru', 'verde', 'rosu', 'galben')
    _fsgc_auto_detected = False
    if 'fsgc' in ak_lower_check and not any(c in ak_lower_check for c in _fsgc_colors):
        if not CORRECT_ANSWERS:
            load_correct_answers()
        detected_color = detect_fsgc_version(image)
        if detected_color:
            matched_key = None
            for k in CORRECT_ANSWERS:
                kl = k.lower()
                logging.info(f'FSGC match check: k={repr(k)}  kl={repr(kl)}  color={detected_color}  match={("fsgc" in kl and detected_color in kl)}')
                if 'fsgc' in kl and detected_color in kl:
                    matched_key = k
                    break
            if matched_key:
                answer_key_name = matched_key
                _fsgc_auto_detected = True
                logging.info(f'FSGC version auto-detected: {detected_color} → key="{answer_key_name}"')
            else:
                logging.warning(f'FSGC version detected "{detected_color}" dar nu exista barem corespunzator')
        else:
            logging.warning('FSGC version detection failed — folosesc baremul original')

    _fpse_colors = ('albastru', 'verde')
    _fpse_auto_detected = False
    if 'fpse' in ak_lower_check and not any(c in ak_lower_check for c in _fpse_colors):
        if not CORRECT_ANSWERS:
            load_correct_answers()
        detected_fpse_color = detect_fpse_version(image)
        if detected_fpse_color:
            matched_fpse_key = None
            want_fpse3 = 'fpse3' in ak_lower_check
            for k in CORRECT_ANSWERS:
                kl2 = k.lower()
                if want_fpse3:
                    match = 'fpse3' in kl2 and detected_fpse_color in kl2
                else:
                    match = 'fpse' in kl2 and 'fpse3' not in kl2 and detected_fpse_color in kl2
                if match:
                    matched_fpse_key = k
                    break
            if matched_fpse_key:
                answer_key_name = matched_fpse_key
                _fpse_auto_detected = True
                logging.info(f'FPSE version auto-detected: {detected_fpse_color} → key="{answer_key_name}"')
            else:
                logging.warning(f'FPSE version detected "{detected_fpse_color}" dar nu exista barem corespunzator')
        else:
            logging.warning('FPSE version detection failed — folosesc baremul original')

    _fsas_rows = ('randul1', 'randul2')
    _fsas_auto_detected = False
    if ('fsas' in ak_lower_check or 'ealr' in ak_lower_check) \
            and not any(r in ak_lower_check for r in _fsas_rows):
        if not CORRECT_ANSWERS:
            load_correct_answers()
        detected_fsas_row = detect_fsas_version(image)
        if detected_fsas_row:
            matched_fsas_key = None
            for k in CORRECT_ANSWERS:
                kl2 = k.lower()
                if ('fsas' in kl2 or 'ealr' in kl2) and detected_fsas_row in kl2:
                    matched_fsas_key = k
                    break
            if matched_fsas_key:
                answer_key_name = matched_fsas_key
                _fsas_auto_detected = True
                logging.info(f'FSAS version auto-detected: {detected_fsas_row} → key="{answer_key_name}"')
            else:
                logging.warning(f'FSAS version detected "{detected_fsas_row}" dar nu exista barem corespunzator')
        else:
            logging.warning('FSAS version detection failed — folosesc baremul original')

    image_for_grid = _enhance_contrast(image)
    grid = detect_grid(image_for_grid)
    if grid is None:
        logging.error('Grid detection failed')
        sid = detect_qr_student_id(image) or fallback_id

        diag_path = None
        try:
            if ('fsas' in ak_lower_check or 'ealr' in ak_lower_check):
                diag = image.copy()
                oh, ow = diag.shape[:2]
                r1_x1 = int(ow * FSAS_R1_X[0]); r1_x2 = int(ow * FSAS_R1_X[1])
                r2_x1 = int(ow * FSAS_R2_X[0]); r2_x2 = int(ow * FSAS_R2_X[1])
                vy1   = int(oh * FSAS_VER_Y[0]); vy2  = int(oh * FSAS_VER_Y[1])
                cv2.rectangle(diag, (r1_x1, vy1), (r1_x2, vy2), (0, 0, 255), 2)
                cv2.rectangle(diag, (r2_x1, vy1), (r2_x2, vy2), (0, 0, 255), 2)
                cv2.putText(diag, 'Randul 1', (r1_x1, max(15, vy1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                cv2.putText(diag, 'Randul 2', (r2_x1, max(15, vy1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)
                cv2.putText(diag, 'GRID DETECTION FAILED - FSAS debug view',
                            (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                _safe_sid = re.sub(r'[^\w\.-]', '_', str(sid))
                _safe_key = re.sub(r'[^\w\.-]', '_', str(answer_key_name))
                _uid = uuid.uuid4().hex[:8]
                os.makedirs(output_dir, exist_ok=True)
                diag_path = os.path.join(
                    output_dir, f'{_safe_sid}_FSASdebug_{_safe_key}_{_uid}.png')
                cv2.imwrite(diag_path, diag)
                logging.info(f'FSAS debug image saved: {diag_path}')
        except Exception as _e:
            logging.warning(f'FSAS debug image generation failed: {_e}')
            diag_path = None

        return sid, None, {}, diag_path, None, answer_key_name

    if cfg_arg is None:
        ak_lower = (answer_key_name or '').lower()
        faculty_cfg = None
        if any(tag in ak_lower for tag in ('fsas', 'fsgc', 'ealr', 'fpse', 'finalizare', 'finlizare')):
            faculty_cfg = get_config_for_key(answer_key_name)

        if faculty_cfg is not None:
            sheet_cfg = _normalise_sheet_cfg(faculty_cfg, grid)
        else:
            if not SHEET_CONFIGS:
                load_sheet_configs()
            gh = grid['grid_hash']
            if gh in SHEET_CONFIGS:
                sheet_cfg = SHEET_CONFIGS[gh]
            else:
                logging.warning(f'Unknown hash {gh} — auto-inferring config '
                                f'({grid["n_rows_raw"]} rows, '
                                f'{len(grid["sections"])} section(s))')
                sheet_cfg = _infer_sheet_cfg(grid)
                SHEET_CONFIGS[gh] = sheet_cfg
                save_sheet_configs()
    else:
        sheet_cfg = _normalise_sheet_cfg(cfg_arg, grid)

    logging.info(f'Sheet cfg: {sheet_cfg.get("name", "unnamed")}  '
                 f'skip={sheet_cfg["skip_rows"]}  '
                 f'qps={sheet_cfg["questions_per_section"]}')

    display    = image.copy()
    student_id, qr_rect = detect_qr_student_id(image)
    student_id = student_id or fallback_id
    if qr_rect:
        cv2.rectangle(display, (qr_rect[0], qr_rect[1]), (qr_rect[2], qr_rect[3]), (0, 255, 255), 3)
    else:
        cv2.rectangle(display, (0, 0), (int(img_w * 0.35), int(img_h * 0.30)), (0, 255, 255), 3)
    logging.info(f'Student: {student_id}  Key: {answer_key_name}')

    if not CORRECT_ANSWERS:
        load_correct_answers()
    if not CORRECT_ANSWERS:
        logging.critical('No answer keys loaded')
        return student_id, None, {}, None, None, answer_key_name

    if answer_key_name not in CORRECT_ANSWERS:
        ak_base = answer_key_name.lower()
        _auto_base_keys = (
            ('fsgc' in ak_base and not any(c in ak_base for c in ('albastru', 'verde', 'rosu', 'galben')))
            or ('fpse' in ak_base and not any(c in ak_base for c in ('albastru', 'verde')))
            or (('fsas' in ak_base or 'ealr' in ak_base) and not any(r in ak_base for r in ('randul1', 'randul2')))
        )
        if _auto_base_keys:
            logging.warning(f"Auto-detect: cheia de baza '{answer_key_name}' negasita si detectia a esuat — foaie sarită")

            diag_path = None
            try:
                if ('fsas' in ak_base or 'ealr' in ak_base):
                    diag = image.copy()
                    oh, ow = diag.shape[:2]
                    r1_x1 = int(ow * FSAS_R1_X[0]); r1_x2 = int(ow * FSAS_R1_X[1])
                    r2_x1 = int(ow * FSAS_R2_X[0]); r2_x2 = int(ow * FSAS_R2_X[1])
                    vy1   = int(oh * FSAS_VER_Y[0]); vy2  = int(oh * FSAS_VER_Y[1])
                    cv2.rectangle(diag, (r1_x1, vy1), (r1_x2, vy2), (0, 0, 255), 3)
                    cv2.rectangle(diag, (r2_x1, vy1), (r2_x2, vy2), (0, 0, 255), 3)
                    cv2.putText(diag, 'Randul 1', (r1_x1, max(15, vy1 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                    cv2.putText(diag, 'Randul 2', (r2_x1, max(15, vy1 - 6)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 255), 2)
                    cv2.putText(diag, 'FSAS AUTO-DETECT FAILED - debug view',
                                (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                    _safe_sid = re.sub(r'[^\w\.-]', '_', str(student_id))
                    _safe_key = re.sub(r'[^\w\.-]', '_', str(answer_key_name))
                    _uid = uuid.uuid4().hex[:8]
                    os.makedirs(output_dir, exist_ok=True)
                    diag_path = os.path.join(
                        output_dir, f'{_safe_sid}_FSASdebug_{_safe_key}_{_uid}.png')
                    cv2.imwrite(diag_path, diag)
                    logging.info(f'FSAS auto-detect debug image saved: {diag_path}')
            except Exception as _e:
                logging.warning(f'FSAS debug image generation failed: {_e}')
                diag_path = None

            return student_id, None, {}, diag_path, None, answer_key_name
        fb = list(CORRECT_ANSWERS.keys())[0]
        logging.warning(f"Key '{answer_key_name}' not found → using '{fb}'")
        answer_key_name = fb
    correct_key = CORRECT_ANSWERS[answer_key_name]

    ROIs = build_rois(grid, sheet_cfg, image=image, answer_key=answer_key_name)
    if not ROIs:
        logging.error('No ROIs built')
        return student_id, None, {}, None, None, answer_key_name
    logging.info(f'ROIs: {len(ROIs)}')

    mdcfg          = get_mark_detection_config(answer_key_name)
    HSV_LOW        = np.array(mdcfg['hsv_low'])
    HSV_HIGH       = np.array(mdcfg['hsv_high'])
    BLUE_THRESHOLD = mdcfg['blue_threshold']
    ROI_INSET_FRAC = mdcfg.get('roi_inset_frac', 0.08)
    logging.info(f'Mark detection: threshold={BLUE_THRESHOLD}  '
                 f'HSV={mdcfg["hsv_low"]}–{mdcfg["hsv_high"]}  '
                 f'inset={ROI_INSET_FRAC}')

    image_for_marks = _enhance_for_marks(image)
    logging.info('Mark detection: using contrast-enhanced image (universal)')

    hsv  = cv2.cvtColor(image_for_marks, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, HSV_LOW, HSV_HIGH)
    k    = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k, iterations=1)
    detected_answers = {}
    sorted_keys      = sorted(ROIs.keys())
    total_marked     = 0

    for rk in sorted_keys:
        qd     = ROIs[rk]
        marked = []
        for opt, (x1, y1, x2, y2) in sorted(qd['options'].items()):
            y1c, y2c = max(0, y1), min(img_h, y2)
            x1c, x2c = max(0, x1), min(img_w, x2)
            if y1c >= y2c or x1c >= x2c:
                continue
            bw_  = max(1, x2c - x1c)
            bh_  = max(1, y2c - y1c)
            ins  = int(min(bw_, bh_) * ROI_INSET_FRAC)
            seg  = mask[y1c + ins:y2c - ins, x1c + ins:x2c - ins]
            npix = seg.size
            pct  = cv2.countNonZero(seg) / npix * 100 if npix else 0
            if pct > BLUE_THRESHOLD:
                marked.append(opt)
        if not marked:
            detected_answers[rk] = 'no response'
        elif len(marked) == 1:
            detected_answers[rk] = marked[0]
            total_marked += 1
        else:
            detected_answers[rk] = marked
            total_marked += 1
            logging.info(f'{rk}: multiple marks {marked}')

    correct = 0
    for rk in sorted_keys:
        qd          = ROIs[rk]
        det         = detected_answers.get(rk, 'no response')
        correct_ans = correct_key.get(str(qd['index']), [])
        is_ok       = isinstance(det, str) and det in correct_ans
        if is_ok:
            correct += 1
        for opt, (x1, y1, x2, y2) in qd['options'].items():
            y1c, y2c = max(0, y1), min(img_h, y2)
            x1c, x2c = max(0, x1), min(img_w, x2)
            if y1c >= y2c or x1c >= x2c:
                continue
            color, thick = (255, 150, 0), 2
            hit = (isinstance(det, list) and opt in det) or det == opt
            if hit:
                color = ((0, 255, 0) if is_ok
                         else (0, 165, 255) if isinstance(det, list)
                         else (0, 0, 255))
                thick = 4
            cv2.rectangle(display, (x1c, y1c), (x2c, y2c), color, thick)

    gcfg  = get_grading_config(answer_key_name)
    total = sheet_cfg['total_questions']
    grade = min((correct * gcfg['grading_multiplier']) + gcfg.get('base', 1.0), 10.0)
    logging.info(f'{student_id}: {correct}/{total} correct  grade={grade}')

    safe_sid = re.sub(r'[^\w\.-]', '_', str(student_id))
    safe_key = re.sub(r'[^\w\.-]', '_', str(answer_key_name))
    uid      = uuid.uuid4().hex[:8]
    os.makedirs(output_dir, exist_ok=True)
    img_out = os.path.join(output_dir, f'{safe_sid}_analyzed_{safe_key}_{uid}.png')
    csv_out = os.path.join(output_dir, f'{safe_sid}_answers_{safe_key}_{uid}.csv')

    try:
        out = display
        if out.shape[0] > 1400:
            sf  = 1400 / out.shape[0]
            out = cv2.resize(out, (int(out.shape[1] * sf), 1400))

        ak_out_lower = answer_key_name.lower()
        _fsgc_color_map = {
            'albastru': (0, 0),
            'verde':    (0, 1),
            'rosu':     (1, 0),
            'galben':   (1, 1),
        }
        detected_color_out = next((c for c in _fsgc_color_map if c in ak_out_lower), None)
        if _fsgc_auto_detected and 'fsgc' in ak_out_lower and detected_color_out:
            oh, ow = out.shape[:2]
            x1r, x2r, y1r, y2r = FSGC_VER_ZONE
            vx1, vx2 = int(ow * x1r), int(ow * x2r)
            vy1, vy2 = int(oh * y1r), int(oh * y2r)
            cv2.rectangle(out, (vx1, vy1), (vx2, vy2), (180, 0, 255), 2)
            row_i, col_i = _fsgc_color_map[detected_color_out]
            mid_x = (vx1 + vx2) // 2
            mid_y = (vy1 + vy2) // 2
            qx1 = vx1 if col_i == 0 else mid_x
            qx2 = mid_x if col_i == 0 else vx2
            qy1 = vy1 if row_i == 0 else mid_y
            qy2 = mid_y if row_i == 0 else vy2
            overlay = out.copy()
            cv2.rectangle(overlay, (qx1, qy1), (qx2, qy2), (180, 0, 255), -1)
            cv2.addWeighted(overlay, 0.25, out, 0.75, 0, out)
            cv2.rectangle(out, (qx1, qy1), (qx2, qy2), (180, 0, 255), 3)

        ak_out_lower_fpse = answer_key_name.lower()
        _fpse_colors_out = ('albastru', 'verde')
        detected_fpse_color_out = next((c for c in _fpse_colors_out if c in ak_out_lower_fpse), None)
        if _fpse_auto_detected and 'fpse' in ak_out_lower_fpse and detected_fpse_color_out:
            oh, ow = out.shape[:2]
            alb_draw_x1 = int(ow * FPSE_ALB_X[0])
            alb_draw_x2 = int(ow * FPSE_ALB_X[1])
            ver_draw_x1 = int(ow * FPSE_VER_X[0])
            ver_draw_x2 = int(ow * FPSE_VER_X[1])
            vy1_fpse    = int(oh * FPSE_VER_Y[0])
            vy2_fpse    = int(oh * FPSE_VER_Y[1])
            cv2.rectangle(out, (alb_draw_x1, vy1_fpse), (alb_draw_x2, vy2_fpse), (0, 140, 255), 2)
            cv2.rectangle(out, (ver_draw_x1, vy1_fpse), (ver_draw_x2, vy2_fpse), (0, 140, 255), 2)
            det_fx1 = alb_draw_x1 if detected_fpse_color_out == 'albastru' else ver_draw_x1
            det_fx2 = alb_draw_x2 if detected_fpse_color_out == 'albastru' else ver_draw_x2
            overlay_f = out.copy()
            cv2.rectangle(overlay_f, (det_fx1, vy1_fpse), (det_fx2, vy2_fpse), (0, 140, 255), -1)
            cv2.addWeighted(overlay_f, 0.30, out, 0.70, 0, out)
            cv2.rectangle(out, (det_fx1, vy1_fpse), (det_fx2, vy2_fpse), (0, 140, 255), 3)
            cv2.putText(out, f'FPSE: {detected_fpse_color_out.upper()}',
                        (det_fx1, vy1_fpse - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 140, 255), 2)

        ak_out_lower_fsas = answer_key_name.lower()
        _fsas_rows_out = ('randul1', 'randul2')
        detected_fsas_row_out = next((r for r in _fsas_rows_out if r in ak_out_lower_fsas), None)
        if _fsas_auto_detected:
            oh, ow = out.shape[:2]
            r1_draw_x1 = int(ow * FSAS_R1_X[0])
            r1_draw_x2 = int(ow * FSAS_R1_X[1])
            r2_draw_x1 = int(ow * FSAS_R2_X[0])
            r2_draw_x2 = int(ow * FSAS_R2_X[1])
            vy1_fsas   = int(oh * FSAS_VER_Y[0])
            vy2_fsas   = int(oh * FSAS_VER_Y[1])
            cv2.rectangle(out, (r1_draw_x1, vy1_fsas), (r1_draw_x2, vy2_fsas), (255, 200, 0), 2)
            cv2.rectangle(out, (r2_draw_x1, vy1_fsas), (r2_draw_x2, vy2_fsas), (255, 200, 0), 2)
            cv2.putText(out, 'Randul 1',
                        (r1_draw_x1, max(15, vy1_fsas - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 200, 0), 1)
            cv2.putText(out, 'Randul 2',
                        (r2_draw_x1, max(15, vy1_fsas - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 200, 0), 1)
            if _fsas_auto_detected and detected_fsas_row_out:
                det_sx1 = r1_draw_x1 if detected_fsas_row_out == 'randul1' else r2_draw_x1
                det_sx2 = r1_draw_x2 if detected_fsas_row_out == 'randul1' else r2_draw_x2
                overlay_s = out.copy()
                cv2.rectangle(overlay_s, (det_sx1, vy1_fsas), (det_sx2, vy2_fsas), (0, 140, 255), -1)
                cv2.addWeighted(overlay_s, 0.30, out, 0.70, 0, out)
                cv2.rectangle(out, (det_sx1, vy1_fsas), (det_sx2, vy2_fsas), (0, 140, 255), 3)
                _fsas_label = 'RÂNDUL 1' if detected_fsas_row_out == 'randul1' else 'RÂNDUL 2'
                cv2.putText(out, f'FSAS: {_fsas_label}',
                            (det_sx1, vy2_fsas + 18),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 140, 255), 2)

        cv2.imwrite(img_out, out)
    except Exception as e:
        logging.error(f'Save image: {e}')
        img_out = None

    try:
        with open(csv_out, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['StudentID', 'ROIKey', 'Index', 'Detected',
                        'Correct', 'IsOK', 'AnswerKey'])
            for rk in sorted_keys:
                qd  = ROIs[rk]
                det = detected_answers.get(rk, 'no response')
                ds  = f"multiple({','.join(det)})" if isinstance(det, list) else det
                ca  = correct_key.get(str(qd['index']), [])
                w.writerow([student_id, rk, qd['index'], ds,
                            ','.join(ca) if ca else 'N/A',
                            'Yes' if (isinstance(det, str) and det in ca) else 'No',
                            answer_key_name])
    except Exception as e:
        logging.error(f'Save CSV: {e}')
        csv_out = None

    return student_id, grade, detected_answers, img_out, csv_out, answer_key_name

def process_all_images_in_directory(directory='uploads',
                                    output_dir='static/results',
                                    answer_key_name='DefaultKey',
                                    sheet_cfg=None,
                                    custom_config=None,
                                    redis_client=None,
                                    batch_processing_id=None,
                                    max_workers=4):
    cfg_arg = custom_config if custom_config is not None else sheet_cfg

    os.makedirs(output_dir, exist_ok=True)
    safe_key     = re.sub(r'[^\w\.-]', '_', answer_key_name)
    summary_path = os.path.join(output_dir,
        f'exam_results_{safe_key}_{batch_processing_id or "no_id"}.csv')

    valid_ext = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff')
    try:
        files = [f for f in os.listdir(directory)
                 if f.lower().endswith(valid_ext)
                 and os.path.isfile(os.path.join(directory, f))]
    except Exception as e:
        logging.error(f'Cannot list directory {directory}: {e}')
        return []
    if not files:
        logging.info('No images found in directory')
        return []

    def _process_one(fname):
        fpath   = os.path.join(directory, fname)
        def_sid = os.path.splitext(fname)[0]
        try:
            sid, grade, answers, ann, csvp, used_key = analyze_exam_sheet(
                fpath, output_dir=output_dir,
                answer_key_name=answer_key_name,
                sheet_cfg=cfg_arg)
            fsid   = sid or def_sid
            status = 'Success' if sid else 'Failed'
            ann_b = os.path.basename(ann)  if ann  and os.path.exists(ann)  else 'N/A'
            csv_b = os.path.basename(csvp) if csvp and os.path.exists(csvp) else 'N/A'
            _gcfg = get_grading_config(used_key)
            _mult = _gcfg['grading_multiplier']
            _base = _gcfg.get('base', 1.0)
            correct_count = round((grade - _base) / _mult) if grade is not None else None
            return {
                'result': {'student_id': fsid, 'grade': grade,
                           'correct_count': correct_count,
                           'original_filename': fname, 'status': status,
                           'answer_key_used': used_key,
                           'answers': answers if isinstance(answers, dict) else {},
                           'annotated_image_path': ann if ann and os.path.exists(ann) else None},
                'csv_row': [fsid,
                            f'{grade:.3f}' if grade is not None else 'N/A',
                            fname, ann_b, csv_b, used_key, status],
                'fname': fname
            }
        except Exception as e:
            logging.exception(f'Error on {fname}: {e}')
            return {
                'result': {'student_id': def_sid, 'grade': None,
                           'original_filename': fname, 'status': 'Error'},
                'csv_row': [def_sid, 'Error', fname, 'Error', 'Error',
                            answer_key_name, f'Error:{type(e).__name__}'],
                'fname': fname
            }

    results = []
    num_workers = min(max_workers, len(files))
    logging.info(f'Batch processing {len(files)} files with {num_workers} workers')

    try:
        with open(summary_path, 'w', newline='') as sf:
            sw = csv.writer(sf)
            sw.writerow(['StudentID', 'Grade', 'Filename', 'AnnotatedImage',
                         'AnswersCSV', 'AnswerKey', 'Status'])

            with ThreadPoolExecutor(max_workers=num_workers) as executor:
                future_to_fname = {executor.submit(_process_one, fname): fname
                                   for fname in files}
                done_count = 0
                for future in as_completed(future_to_fname):
                    done_count += 1
                    data = future.result()
                    results.append(data['result'])
                    sw.writerow(data['csv_row'])
                    logging.info(f'  ({done_count}/{len(files)}) {data["fname"]}')
                    if redis_client and batch_processing_id:
                        try:
                            redis_client.incr(
                                f'batch_progress:{batch_processing_id}:processed_count')
                        except Exception:
                            pass
    except IOError as e:
        logging.error(f'Cannot write summary: {e}')
        return []

    logging.info(f'Batch done: {len(results)} files')
    return results
