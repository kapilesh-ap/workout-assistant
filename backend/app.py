from flask import Flask, request, jsonify, send_from_directory 
from flask_cors import CORS 
import logging
import os
from groq import Groq 
from langchain_groq import ChatGroq 
from functools import wraps
from datetime import datetime
from pydub import AudioSegment
import io
import pyttsx3
import base64
import mediapipe as mp
import cv2
import numpy as np
import json
import re
from io import BytesIO
from pathlib import Path
import subprocess
import wave
import array
import struct
import requests
from requests.exceptions import RequestException
import tempfile
import sys
import shutil

# Initialize Flask app and CORS
app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(
    filename='app.log',
    level=logging.DEBUG,
    format='%(asctime)s %(levelname)s %(name)s %(threadName)s : %(message)s'
)

# Configuration
GROQ_API_KEY = "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"  # Replace with your API key
# Configuration
ALLOWED_EXTENSIONS = {'wav', 'webm', 'mp3'}  # Added webm to allowed extensions
MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB
TEMP_DIR = Path('backend_temp')
TEMP_DIR.mkdir(exist_ok=True)

def allowed_file(filename):
    """Check if the file type is allowed"""
    allowed_mimetypes = {
        'audio/wav', 'audio/webm', 'audio/mp3', 'audio/mpeg',
        'audio/webm;codecs=opus', 'audio/ogg', 'audio/x-wav',
        'application/octet-stream'  # Some browsers may send this for audio files
    }
    return True  # Temporarily accept all files since we'll convert anyway

def validate_audio_file(file):
    """Basic file validation"""
    if not file:
        raise ValueError("No file provided")
    
    # Check file size
    file.seek(0, os.SEEK_END)
    size = file.tell()
    file.seek(0)
    
    if size > MAX_FILE_SIZE:
        raise ValueError("File size too large")
    
    if size < 1024:  # Less than 1KB
        raise ValueError("File too small - likely empty or corrupted")
    
    return True

# Initialize clients
groq_client = Groq(api_key=GROQ_API_KEY)
groq_llm = ChatGroq(
    temperature=0,
    model="llama-3.3-70b-versatile",
    api_key=GROQ_API_KEY
)

def error_handler(f):
    """Decorator for handling errors in routes"""
    @wraps(f)
    def wrapper(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logging.error(f"Error: {str(e)}")
            return jsonify({'error': str(e)}), 500
    return wrapper

def process_audio_file(file):
    """Process the audio file and return transcription"""
    temp_files = []
    try:
        # Create filenames with timestamps
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        temp_original = TEMP_DIR / f'original_{timestamp}.wav'
        temp_converted = TEMP_DIR / f'converted_{timestamp}.mp3'
        temp_files.extend([temp_original, temp_converted])

        # Save the original file
        file.save(str(temp_original))

        # Convert to MP3
        audio = AudioSegment.from_file(str(temp_original))
        audio.export(str(temp_converted), format="mp3")
            
        # Open and send the MP3 file
        with open(temp_converted, 'rb') as audio_file:
            transcription = groq_client.audio.transcriptions.create(
                file=audio_file,
                model="whisper-large-v3-turbo",
                response_format="json"
            )

        return transcription.text

    finally:
        # Clean up temp files (optional - comment out if you want to keep them)
        for temp_file in temp_files:
            try:
                if os.path.exists(temp_file):
                    os.remove(temp_file)
            except Exception as e:
                logging.warning(f"Failed to delete temporary file {temp_file}: {str(e)}")

def post_process_transcription(transcription):
    """Post-process the transcription to remove noise and improve quality"""
    if not transcription or not transcription.text:
        return ""
    
    text = transcription.text
    
    # Remove common noise patterns
    noise_patterns = [
        r'\[.*?\]',           # Remove bracketed content
        r'\(.*?\)',           # Remove parenthetical content
        r'<.*?>',             # Remove HTML-like tags
        r'#\w+',              # Remove hashtags
        r'http\S+',           # Remove URLs
        r'\b(um|uh|er|ah)\b'  # Remove common filler words
    ]
    
    for pattern in noise_patterns:
        text = re.sub(pattern, '', text, flags=re.IGNORECASE)
    
    # Remove multiple spaces and trim
    text = ' '.join(text.split())
    text = text.strip()
    
    # Filter out very short or likely noise segments
    if len(text) < 3 or text in ['.', '..', '...', 'hmm', 'mmm']:
        return ""
    
    return text

# Add configuration for audio processing
AUDIO_PROCESSING_CONFIG = {
    'sample_rate': 16000,
    'channels': 1,
    'noise_reduction': True,
    'normalize_audio': True,
    'high_pass_cutoff': 80,    # Hz
    'low_pass_cutoff': 8000,   # Hz
    'silence_threshold': -40,   # dB
    'min_silence_len': 500,    # ms
}

# Add voice options
VOICE_OPTIONS = {
    'en-us': 'English (US)',
    'en-uk': 'English (UK)',
    'en-au': 'English (Australian)',
    'en-in': 'English (Indian)'
}

def text_to_speech(text, voice='en-us'):
    """Convert text to speech using pyttsx3"""
    if not text or text.isspace():
        print("No text provided or empty text")
        return None
    
    try:
        print("\n=== Starting TTS Conversion ===")
        print(f"Input text: '{text}'")
        
        # Initialize the TTS engine
        engine = pyttsx3.init()
        
        # Set properties
        engine.setProperty('rate', 150)    # Speed of speech
        engine.setProperty('volume', 0.9)  # Volume (0.0 to 1.0)
        
        # Create unique filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        audio_file = TEMP_DIR / f'tts_output_{timestamp}.wav'
        
        print(f"Saving to file: {audio_file}")
        
        # Save to file
        engine.save_to_file(text, str(audio_file))
        engine.runAndWait()
        
        # Verify file was created and has content
        if not os.path.exists(audio_file):
            raise Exception("Audio file was not created")
            
        file_size = os.path.getsize(audio_file)
        if file_size == 0:
            raise Exception("Generated audio file is empty")
            
        print(f"Generated file size: {file_size} bytes")
        
        # Read the file and convert to base64
        with open(audio_file, 'rb') as f:
            audio_data = f.read()
            audio_b64 = base64.b64encode(audio_data).decode('utf-8')
        
        print("=== TTS Conversion Complete ===\n")
        return audio_b64
        
    except Exception as e:
        print(f"=== TTS Error ===")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {str(e)}")
        print(f"=== End Error ===\n")
        logging.error(f"TTS error: {str(e)}")
        return None

@app.route('/api/voices', methods=['GET'])
def get_voices():
    """Get available voice options"""
    return jsonify(VOICE_OPTIONS)

def create_user_agent_llm():
    """Create a separate LLM instance for the user agent"""
    return ChatGroq(
        temperature=0,
        model="llama-3.3-70b-versatile",
        api_key=GROQ_API_KEY
    )

def user_agent_processor(transcription, exercise_metrics=None):
    """
    User agent layer that processes transcription and exercise context
    """
    if not transcription or transcription.isspace():
        return ""
    
    user_agent_llm = create_user_agent_llm()
    
    exercise_context = ""
    if exercise_metrics:
        exercise_context = f"""
Current exercise context:
- Exercise: {exercise_metrics.get('exerciseName', 'Unknown')}
- Reps completed: {exercise_metrics.get('repCount', 0)}
- Form quality: {exercise_metrics.get('form', 'unknown')}
- Recent feedback: {', '.join(exercise_metrics.get('lastFeedback', []))}
"""

    user_agent_prompt = f"""You are a preprocessing agent for a gym chatbot. Your job is to:
1. Clean and format the user's speech transcription
2. Consider the current exercise context when processing
3. Keep exercise-specific terminology intact
4. Remove noise and filler words
5. If the input is just noise or completely unrelated to fitness/current exercise, return empty string

Exercise Context:
{exercise_context}

Input transcription: "{transcription}"

Return only the processed text without any explanation:"""

    try:
        response = user_agent_llm.invoke(user_agent_prompt)
        processed_text = response.content.strip()
        
        if len(processed_text) < 3 or processed_text.lower() in ['none', 'empty', 'null']:
            return ""
            
        return processed_text
    except Exception as e:
        logging.error(f"User agent processing error: {str(e)}")
        return transcription

def get_llm_response(text, exercise_metrics=None):
    """Get response from LLM with detailed exercise context"""
    processed_text = user_agent_processor(text, exercise_metrics)
    
    if not processed_text:
        return ""
    
    exercise_context = ""
    if exercise_metrics:
        # Format exercise feedback in a more natural way
        feedback_text = ""
        if exercise_metrics.get('feedback'):
            feedback_text = "Current form feedback:\n- " + "\n- ".join(exercise_metrics['feedback'])
        
        # Calculate exercise duration in minutes and seconds
        duration = exercise_metrics.get('duration', 0)
        minutes = duration // 60
        seconds = duration % 60
        duration_text = f"{minutes} minutes and {seconds} seconds" if minutes > 0 else f"{seconds} seconds"

        exercise_context = f"""
Current Exercise Information:
- Exercise: {exercise_metrics.get('exerciseName', 'Unknown')}
- Duration: {duration_text}
- Repetitions completed: {exercise_metrics.get('repCount', 0)}
- Form quality: {exercise_metrics.get('form', 'unknown').replace('_', ' ')}

{feedback_text}

Exercise confidence: {exercise_metrics.get('confidence', 1) * 100:.0f}%
"""

    prompt = f"""You are Max, a friendly AI gym buddy. Keep these rules strictly:
1. Give short, encouraging responses (1-2 sentences)
2. Comment on their form and progress based on the metrics
3. If form needs correction, mention the specific issues
4. Celebrate milestones (every 5-10 reps)
5. Be motivating but natural
6. If they're struggling with form, offer simple tips
7. Acknowledge improvements in form or rep count

Exercise Context:
{exercise_context}

The person working out just said: "{processed_text}"

Respond as Max with a natural, encouraging response that considers their current exercise performance:"""
    
    response = groq_llm.invoke(prompt)
    return response.content.strip()

def create_response(transcription, llm_response):
    """Create standardized response"""
    return {
        'success': True,
        'transcription': transcription,
        'llm_response': llm_response,
        'timestamp': datetime.now().isoformat()
    }

@app.route('/health', methods=['GET'])
@error_handler
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/transcribe', methods=['POST'])
@error_handler
def transcribe_audio():
    """Main endpoint for audio transcription and processing"""
    try:
        # Debug logging
        print("Received transcription request")
        
        # Validate request
        if 'audio' not in request.files:
            print("No audio file in request")
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        print(f"Received file: {audio_file.filename}")
        
        # Validate audio file
        validate_audio_file(audio_file)
        print("File validation passed")
        
        # Get exercise metrics from request
        exercise_metrics = None
        if 'exercise_metrics' in request.form:
            exercise_metrics = json.loads(request.form['exercise_metrics'])
        
        # Process audio file
        transcription = process_audio_file(audio_file)
        print(f"Transcription: {transcription}")
        
        # Skip processing if transcription is empty or just noise
        if not transcription or transcription.strip() in ['.', '..', '...', 'hmm', 'mmm']:
            print("Empty or noise transcription - skipping")
            return jsonify({
                'success': True,
                'transcription': '',
                'llm_response': '',
                'audio_response': None,
                'timestamp': datetime.now().isoformat()
            })
        
        # Get LLM response with exercise metrics
        llm_response = get_llm_response(transcription, exercise_metrics)
        print(f"LLM response: {llm_response}")
        
        # Skip audio generation for empty LLM responses
        audio_b64 = None
        if llm_response and llm_response.strip():
            # Clean up LLM response before TTS
            llm_response = llm_response.strip('"\'')  # Remove surrounding quotes
            
            # Generate audio response
            voice = request.form.get('voice', 'en-us')
            print("Generating audio response...")
            audio_b64 = text_to_speech(llm_response, voice)
            
            if audio_b64:
                print("Audio generated successfully")
            else:
                print("No audio generated")
        else:
            print("Empty LLM response - skipping audio generation")
        
        response = {
            'success': True,
            'transcription': transcription,
            'llm_response': llm_response or '',
            'audio_response': audio_b64,
            'timestamp': datetime.now().isoformat()
        }
        
        return jsonify(response)
        
    except ValueError as e:
        logging.warning(f"Validation error: {str(e)}")
        return jsonify({'error': str(e)}), 400
        
    except Exception as e:
        logging.error(f"Processing error: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500

# Initialize MediaPipe Pose
mp_pose = mp.solutions.pose
pose = mp_pose.Pose(
    static_image_mode=False,
    model_complexity=2,
    enable_segmentation=False,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

@app.route('/api/get-pose-3d', methods=['POST'])
def get_pose_3d():
    try:
        # Get image data from request
        data = request.json
        image_data = data['image'].split(',')[1]
        image_bytes = base64.b64decode(image_data)
        
        # Convert to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Convert BGR to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Process the image
        results = pose.process(image_rgb)
        
        if results.pose_world_landmarks:
            # Convert landmarks to list
            landmarks_3d = []
            for landmark in results.pose_world_landmarks.landmark:
                landmarks_3d.append({
                    'x': landmark.x,
                    'y': landmark.y,
                    'z': landmark.z,
                    'visibility': landmark.visibility
                })
            
            return jsonify({
                'success': True,
                'landmarks': landmarks_3d
            })
        
        return jsonify({
            'success': False,
            'error': 'No pose detected'
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        })

# Add new route to serve audio files
@app.route('/audio/<filename>')
def serve_audio(filename):
    """Serve audio files from the temp directory"""
    try:
        return send_from_directory(TEMP_DIR, filename)
    except Exception as e:
        logging.error(f"Error serving audio file: {str(e)}")
        return jsonify({'error': 'File not found'}), 404

if __name__ == '__main__':
    app.run(debug=True, port=5000)