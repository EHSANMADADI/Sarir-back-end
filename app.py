import os
from flask import Flask, send_from_directory, request, jsonify, send_file
from flask_cors import CORS
import requests
import sys
import os
from io import BytesIO
from threading import Lock, Thread
from queue import Queue
from threading import Lock
from queue import Queue
import functools
from werkzeug.utils import secure_filename


app = Flask(__name__, static_folder='build')

# CORS(app, resources={r"/*": {"origins": "*"}})
CORS(app)

REQUEST_QUEUE = Queue(maxsize=3)
ACTIVE_REQUEST_LOCK = Lock()

def single_request(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            with ACTIVE_REQUEST_LOCK:
                try:
                    REQUEST_QUEUE.put(True, timeout=300)
                except Full:
                    return jsonify({
                        'error': 'Server queue is full. Please try again later.'
                    }), 429

                try:
                    return func(*args, **kwargs)
                finally:
                    REQUEST_QUEUE.get()
                    REQUEST_QUEUE.task_done()

        except Exception as e:
            app.logger.error(f"Error in queued request: {str(e)}")
            return jsonify({'error': 'An unexpected error occurred'}), 500

    return wrapper


# Config
HOST = '0.0.0.0'
PORT = 18017
BASE_URL = 'http://localhost:80/api/'
HTTPS_BASE_URL = 'https://localhost:80/api/'
AUTH_TOKEN = 'a4d80ebb1aaab8067b110d7c18ac93427f0f36ab'
EXCEL_URL = 'http://127.0.0.1:18012'
AYA_URL = 'http://localhost:17012'
DORNA_URL = 'http://localhost:17013'
NER_URL = 'http://localhost:17014'
ASR_URL = 'http://127.0.0.1:18011'
SR_URL = 'http://127.0.0.1:18010'
KWS_URL = 'http://127.0.0.1:18013'
#OCR_URL = 'http://192.168.4.166/api/'
OCR_URL = 'http://localhost:17018/translation'
OCR_URL_ = 'http://localhost:17018'


@app.route("/", defaults={'path': ''})
@app.route("/<path:path>")
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

@app.route('/Tess/static/<path:foldername>/<path:filename>')
def process_image_results(foldername, filename):
    try:
        response = requests.get(f'{OCR_URL_}/static/{foldername}/{filename}')
        response.raise_for_status()
        return response.content, response.status_code, response.headers.items()
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route('/process_Hebrew', methods=['POST'])
def process_image_():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    image_file = request.files['image']

    if image_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400


    files = {
        # 'document': (image_file.filename, image_file.stream, image_file.content_type),
        'image': image_file,
    }

    try:
        response = requests.post(f'{OCR_URL}', files=files)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500
        # return jsonify({'error': f'{image_file.filename}'}), 500

@app.route('/process_image', methods=['POST'])
def process_image():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400

    image_file = request.files['image']

    if image_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    headers = {
        'Authorization': f'Token {AUTH_TOKEN}'
    }

    files = {
        'document': (image_file.filename, image_file.stream, image_file.content_type)
    }

    try:
        response = requests.post(f'{BASE_URL}read_document/', headers=headers, files=files)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/download_word', methods=['POST'])
def download_word():
    data = request.json
    if 'document_url' not in data:
        return jsonify({'error': 'No document_url provided'}), 400

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Token {AUTH_TOKEN}'
    }

    try:
        response = requests.post(f'{BASE_URL}download_word/', json=data, headers=headers)
        response.raise_for_status()
        return response.content, response.status_code, response.headers.items()
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/download_excel', methods=['POST'])
def download_excel():
    data = request.json
    if 'document_url' not in data:
        return jsonify({'error': 'No document_url provided'}), 400

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Token {AUTH_TOKEN}'
    }

    try:
        response = requests.post(f'{BASE_URL}download_excel/', json=data, headers=headers)
        response.raise_for_status()
        return response.content, response.status_code, response.headers.items()
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/download_pdf', methods=['POST'])
def download_pdf():
    data = request.json
    if 'document_url' not in data:
        return jsonify({'error': 'No document_url provided'}), 400

    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Token {AUTH_TOKEN}'
    }

    try:
        response = requests.post(f'{BASE_URL}download_pdf/', json=data, headers=headers)
        response.raise_for_status()
        return response.content, response.status_code, response.headers.items()
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/upload_text', methods=['POST'])
def upload_text():
    data = request.json
    if 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    try:
        response = requests.post(f'{AYA_URL}/upload_text', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    if 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    try:
        response = requests.post(f'{AYA_URL}/chat', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/upload_text_dorna', methods=['POST'])
def upload_text_dorna():
    data = request.json
    if 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    try:
        response = requests.post(f'{DORNA_URL}/upload_text', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/chat_dorna', methods=['POST'])
def chat_dorna():
    data = request.json
    if 'message' not in data:
        return jsonify({'error': 'No message provided'}), 400

    try:
        response = requests.post(f'{DORNA_URL}/chat', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/spellcheck', methods=['POST'])
def spellcheck():
    data = request.json
    if 'sentence' not in data:
        return jsonify({'error': 'No sentence provided'}), 400

    try:
        response = requests.post(f'{NER_URL}/spellcheck', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/spell_correction', methods=['POST'])
def spell_correction():
    data = request.json
    if 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    try:
        response = requests.post(f'{NER_URL}/spell_correction', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/semantic_correction', methods=['POST'])
def semantic_correction():
    data = request.json
    if 'text' not in data:
        return jsonify({'error': 'No text provided'}), 400

    try:
        response = requests.post(f'{NER_URL}/semantic_correction', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/ner', methods=['POST'])
def ner():
    data = request.json
    if 'text' not in data or not isinstance(data['text'], list):
        return jsonify({'error': 'Invalid or missing text array'}), 400

    try:
        response = requests.post(f'{NER_URL}/ner', json=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

# ----------------Automotic speech recognition----------------
@app.route('/api/transcribe/file', methods=['POST'])
@single_request
def transcribe_file():
    try:
        response = requests.post(f'{ASR_URL}/api/transcribe/file', files=request.files, data=request.form)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


# ----------------Speech enhancement (enh)----------------
@app.route('/static/uploads/output/<path:filename>')
@single_request
def enh_results(filename):
    try:
        response = requests.get(f'{ASR_URL}/static/uploads/output/{filename}')
        response.raise_for_status()
        return response.content, response.status_code, response.headers.items()
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/enh/file', methods=['POST'])
@single_request
def enh_file():
    try:
        # Check if a file is present in the request
        if 'file' not in request.files:
            return jsonify({'error': 'No file part in the request'}), 400

        # Retrieve the file
        file = request.files['file']
        model_type = request.form.get('model_type', '')

        # Forward the file and other data to the ASR service
        response = requests.post(
            f'{ASR_URL}/api/enh/file',
            files={'file': (file.filename, file.stream, file.content_type)},
            data={'model_type': model_type}
        )

        # Raise an exception for HTTP errors
        response.raise_for_status()

        # Return the response from the ASR service
        return jsonify(response.json()), response.status_code

    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

# ----------------Voice activity detection (vad)----------------
@app.route('/static/VAD/Output/<path:filename>')
@single_request
def vad_results(filename):
    try:
        response = requests.get(f'{ASR_URL}/static/VAD/Output/{filename}')
        response.raise_for_status()
        return response.content, response.status_code, response.headers.items()
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/vad/file', methods=['POST'])
@single_request
def vad_file():
    try:
        # Check if a file is present in the request
        if 'file' not in request.files:
            return jsonify({'error': 'No file part in the request'}), 400

        # Retrieve the file
        file = request.files['file']
        additional_data = {key: value for key, value in request.form.items()}  # Handle additional form fields if needed
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 5
    try:
        # Forward the file and additional data to the ASR service
        response = requests.post(
            f'{ASR_URL}/api/vad/file',
            files={'file': (file.filename, file.stream, file.content_type)},
            data=additional_data
        )
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 50
    try:

        # Raise an exception for HTTP errors
        response.raise_for_status()
    except requests.RequestException as e:
         try:
        # Return the response from the ASR service
          return jsonify(response.json()), response.status_code

         except requests.RequestException as e:
          return jsonify({'error': str(e)}), 540
    try:
        # Return the response from the ASR service
        return jsonify(response.json()), response.status_code

    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 550


# ----------------Super resolution project----------------
@app.route('/results/<path:filename>')
@single_request
def serve_results(filename):
    try:
        response = requests.get(f'{SR_URL}/results/{filename}')
        response.raise_for_status()
        return response.content, response.status_code, response.headers.items()
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/restore', methods=['POST'])
@single_request
def restore_image():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']
        files = {
            'image': (file.filename, file.stream, file.content_type)
        }
        data = {
            'fidelity_weight': request.form.get('fidelity_weight', 0.5)
        }

        response = requests.post(f'{SR_URL}/restore', files=files, data=data)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/gfgpan', methods=['POST'])
@single_request
def gfgpan_image():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']
        files = {
            'image': (file.filename, file.stream, file.content_type)
        }
        response = requests.post(f'{SR_URL}/gfgpan', files=files)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code

    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500


@app.route('/swinir', methods=['POST'])
@single_request
def swinir_image():
    try:
        if 'image' not in request.files:
            return jsonify({'error': 'No image file provided'}), 400

        file = request.files['image']
        files = {
            'image': (file.filename, file.stream, file.content_type)
        }
        response = requests.post(f'{SR_URL}/swinir', files=files)
        response.raise_for_status()
        return jsonify(response.json()), response.status_code

    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500
    

# ----------------Extract information  from excel file----------------
@app.route('/api/upload', methods=['POST'])
@single_request
def upload_file_service():
    """Service endpoint to handle file upload to the main API."""
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        files = {
            'file': (file.filename, file.stream, file.content_type)
        }
        
        response = requests.post(f'{EXCEL_URL}/upload', files=files)
        response.raise_for_status()
        
        return jsonify(response.json()), response.status_code
    
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/extract', methods=['POST'])
@single_request
def extract_info_service():
    """Service endpoint to handle information extraction from uploaded file."""
    try:
        data = request.json
        if not data or 'file_path' not in data:
            return jsonify({'error': 'No file_path provided'}), 400
        
        response = requests.post(
            f'{EXCEL_URL}/extract',
            json={'file_path': data['file_path']}
        )
        response.raise_for_status()
        
        return jsonify(response.json()), response.status_code
    
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/download/<filename>', methods=['GET'])
@single_request
def download_file_service(filename):
    """Service endpoint to handle file downloads."""
    try:
        response = requests.get(f'{EXCEL_URL}/download/{filename}', stream=True)
        response.raise_for_status()
        
        # Create a BytesIO object from the response content
        file_stream = BytesIO(response.content)
        
        return send_file(
            file_stream,
            download_name=filename,
            as_attachment=True,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        
    except requests.RequestException as e:
        return jsonify({'error': str(e)}), 500

# ----------------Keyword spotting project (kws)----------------
@app.route('/process', methods=['POST'])
@single_request
def process_audio_service():
    """Service endpoint to handle audio processing with word spotting."""
    try:
        # Validate request contains required files and parameters
        if 'files' not in request.files:
            return jsonify({'error': 'No audio files provided'}), 400
        
        if 'support_files' not in request.files:
            return jsonify({'error': 'No support files provided'}), 400
            
        if 'support_name' not in request.form:
            return jsonify({'error': 'No support name provided'}), 400

        # Get the language parameter (default to 'Others' if not provided)
        lang = request.form.get('lang', 'Others')
        
        # Prepare the files for the request
        files_to_forward = []
        for file in request.files.getlist('files'):
            # --- تغییر در اینجا ---
            original_filename = file.filename
            base_filename = os.path.basename(original_filename) # گرفتن نام پایه
            files_to_forward.append(('files', (base_filename, # ارسال نام پایه
                                              file.stream,
                                              file.content_type)))
            
        support_files_to_forward = []
        for support_file in request.files.getlist('support_files'):
             # --- تغییر در اینجا ---
            original_filename = support_file.filename
            base_filename = os.path.basename(original_filename) # گرفتن نام پایه
            support_files_to_forward.append(('support_files', (base_filename, # ارسال نام پایه
                                                              support_file.stream,
                                                              support_file.content_type)))
        # Combine all files and form data
        all_files = files_to_forward + support_files_to_forward
        form_data = {
            'lang': lang,
            'support_name': request.form['support_name']
        }
        
        # Send request to word spotting service
        response = requests.post(
            f'{KWS_URL}/process',
            files=all_files,
            data=form_data
        )
        response.raise_for_status()
        
        return jsonify(response.json()), response.status_code
    
    except requests.RequestException as e:
        return jsonify({'error': f'Service error: {str(e)}'}), 500
    except Exception as e:
        return jsonify({'error': f'Internal error: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(host=HOST, port=PORT, debug=True)