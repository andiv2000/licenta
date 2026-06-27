from flask import request, jsonify, session
from . import api_bp
from ..utils.config import (
    UPLOAD_FOLDER_FSGC, UPLOAD_FOLDER_DREPT, UPLOAD_FOLDER_SPORT,
    UPLOAD_FOLDER_FSAS, UPLOAD_FOLDER_FPSE, UPLOAD_FOLDER_FINALIZARE, ALLOWED_EXTENSIONS, RESULTS_FOLDER
)
import logging
import os
import sys
import json

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../')))

try:
    import exam_analysis
except ImportError as e:
    logger = logging.getLogger(__name__)
    logger.error(f"Failed to import exam_analysis: {e}")
    exam_analysis = None

logger = logging.getLogger(__name__)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@api_bp.route('/upload/exam-sheet', methods=['POST'])
def upload_exam_sheet():
    if 'user_email' not in session:
        return jsonify({'success': False, 'message': 'Not authenticated'}), 401
    
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': 'File type not allowed'}), 400
    
    answer_key = request.form.get('answer_key', 'DefaultKey')

    from .exam_routes import _guard_answer_key_use
    denied = _guard_answer_key_use(answer_key)
    if denied:
        return denied
    
    from ..utils.auth import normalize_faculty
    faculty = normalize_faculty(session.get('user_faculty')) or 'default'
    
    faculty_lower = faculty.lower() if faculty else 'default'
    if faculty_lower == 'fsgc':
        upload_folder = UPLOAD_FOLDER_FSGC
    elif faculty_lower == 'drept':
        upload_folder = UPLOAD_FOLDER_DREPT
    elif faculty_lower == 'sport':
        upload_folder = UPLOAD_FOLDER_SPORT
    elif faculty_lower == 'fsas':
        upload_folder = UPLOAD_FOLDER_FSAS
    elif faculty_lower == 'fpse':
        upload_folder = UPLOAD_FOLDER_FPSE
    elif faculty_lower == 'finalizare':
        upload_folder = UPLOAD_FOLDER_FINALIZARE
    else:
        upload_folder = UPLOAD_FOLDER_FSGC
    
    try:
        os.makedirs(upload_folder, exist_ok=True)
        filename = file.filename
        filepath = os.path.join(upload_folder, filename)
        file.save(filepath)
        
        logger.info(f"File uploaded: {filepath}")
        
        if exam_analysis is None:
            return jsonify({
                'success': True,
                'message': 'File uploaded successfully but analysis module not available',
                'file': {'name': filename, 'path': filepath}
            }), 200
        
        results_dir = os.path.abspath(RESULTS_FOLDER)
        os.makedirs(results_dir, exist_ok=True)
        
        logger.info(f"Starting analysis with key: {answer_key}, results dir: {results_dir}")
        
        custom_config = None
        try:
            if exam_analysis and hasattr(exam_analysis, 'get_config_for_key'):
                custom_config = exam_analysis.get_config_for_key(answer_key)
                logger.info(f"Sheet config for '{answer_key}': {custom_config}")
        except Exception as e:
            logger.warning(f"Failed to create custom config: {e}")
        
        student_id, grade, answers, output_img, output_csv, _used_key = exam_analysis.analyze_exam_sheet(
            filepath, 
            results_dir, 
            answer_key,
            custom_config=custom_config
        )
        
        logger.info(f"Analysis result - Student ID: {student_id}, Grade: {grade}")
        
        if student_id is None:
            return jsonify({
                'success': False,
                'message': 'Analiza a eșuat — grila nu a putut fi detectată. Încercați o poză mai dreaptă, cu tot tabelul vizibil.',
                'file': {'name': filename, 'path': filepath}
            }), 400

        if grade is None:
            grade = 1.0
        
        return jsonify({
            'success': True,
            'message': 'File uploaded and analyzed successfully',
            'file': {'name': filename, 'path': filepath},
            'analysis': {
                'student_id': student_id,
                'grade': grade,
                'answers': answers,
                'output_image': f'/static/results/{os.path.basename(output_img)}' if output_img else None,
                'output_csv': f'/static/results/{os.path.basename(output_csv)}' if output_csv else None
            }
        }), 200
        
    except Exception as e:
        logger.error(f"Upload/Analysis error: {e}", exc_info=True)
        return jsonify({'success': False, 'message': str(e)}), 500
