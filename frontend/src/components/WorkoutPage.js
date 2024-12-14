import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import AudioControls from './AudioControls';
import PoseDetection from './PoseDetection';
import PoseDetection3D from './PoseDetection3D';
import '../styles/WorkoutPage.css';
import Skeleton3D from './Skeleton3D';
import ExerciseDetector from '../utils/ExerciseDetector';



const WorkoutPage = () => {
    const [isStarted, setIsStarted] = useState(false);
    const [transcription, setTranscription] = useState('');
    const [conversation, setConversation] = useState([]);
    const webcamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);
    const conversationBoxRef = useRef(null);
    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const audioDataRef = useRef(new Uint8Array(2048));
    const [selectedVoice, setSelectedVoice] = useState('en-us');
    const [recordingTime, setRecordingTime] = useState(0);
    const recordingInterval = useRef(null);
    const [audioLevel, setAudioLevel] = useState(0);
    const skeletonCanvasRef = useRef(null);
    const [poseLandmarks, setPoseLandmarks] = useState(null);
    const [exerciseState, setExerciseState] = useState({
        currentExercise: 'unknown',
        repCount: 0,
        form: 'unknown',
        feedback: []
    });
    const exerciseDetectorRef = useRef(new ExerciseDetector());
    const [audioQueue, setAudioQueue] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    if (conversationBoxRef.current) {
      conversationBoxRef.current.scrollTop = conversationBoxRef.current.scrollHeight;
    }
  }, [conversation]);

  const handleVoiceChange = (voice) => {
    setSelectedVoice(voice);
  };

  

  const isAudioSignificant = (audioData, threshold = 0.1) => {
    let peaks = 0;
    for (let i = 0; i < audioData.length; i++) {
      if (audioData[i] > threshold) {
        peaks++;
      }
    }
    const peakPercentage = (peaks / audioData.length) * 100;
    // console.log('Audio level:', peakPercentage);
    setAudioLevel(peakPercentage);
    return peakPercentage > 0.1; // Return true if audio level is above 1%
  };
  const hasAudioActivityRef = useRef(false);
  const monitorAudioLevel = () => {
    if (analyserRef.current) {
      analyserRef.current.getByteFrequencyData(audioDataRef.current);
      isAudioSignificant(audioDataRef.current);
      requestAnimationFrame(monitorAudioLevel);
    }
  };
  const checkAudioActivity = (audioData) => {
    // Check if any frequency has amplitude above threshold (e.g., 10)
    const threshold = 10;
    return audioData.some(value => value > threshold);
  };

  const startWorkout = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      
      analyserRef.current.fftSize = 4096;
      analyserRef.current.smoothingTimeConstant = 0.3;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;
      
      source.connect(analyserRef.current);
      audioDataRef.current = new Uint8Array(analyserRef.current.frequencyBinCount);
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = async () => {
        // Check audio level before sending
        analyserRef.current.getByteFrequencyData(audioDataRef.current);
        const hasSignificantAudio = isAudioSignificant(audioDataRef.current);
        
        if (chunksRef.current.length > 0 || hasSignificantAudio) {
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' });
          chunksRef.current = [];
          await sendAudioToServer(audioBlob);
        } else {
          // Clear chunks if audio level is too low
          chunksRef.current = [];
          console.log('Audio level too low, not sending');
        }
      };

      mediaRecorderRef.current.start();
      recordingInterval.current = setInterval(() => {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.start();
        setRecordingTime(prev => prev + 5);
      }, 5000);

      // Start audio level monitoring
      requestAnimationFrame(monitorAudioLevel);
      setIsStarted(true);
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Please allow access to camera and microphone');
    }
  };


  const sendAudioToServer = async (audioBlob) => {
    try {
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('voice', selectedVoice);
        
        // Add detailed exercise metrics
        if (exerciseState.currentExercise !== 'unknown') {
            const exerciseMetrics = {
                ...exerciseState,
                exerciseName: formatExerciseName(exerciseState.currentExercise),
                duration: recordingTime,
                confidence: exerciseState.confidence || 1,
                lastFeedback: exerciseState.feedback.slice(-3) // Send last 3 feedback items
            };
            formData.append('exercise_metrics', JSON.stringify(exerciseMetrics));
        }

        const response = await fetch('http://localhost:5000/api/transcribe', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();
        
        // Filter out invalid transcriptions
        const transcription = data.transcription?.trim() || '';
        if (transcription && 
            transcription !== '.' && 
            transcription !== '..' &&
            transcription !== '...' &&
            transcription !== 'Thank you.' &&
            !transcription.startsWith('(') && 
            transcription.length > 2) {       
            
            console.log('Valid transcription:', transcription);
            setTranscription(transcription);
            
            // Only update conversation if we have both transcription and response
            if (data.llm_response?.trim()) {
                setConversation(prev => [...prev, 
                    { type: 'user', text: transcription },
                    { type: 'assistant', text: data.llm_response }
                ]);

                // Add audio to queue instead of playing immediately
                if (data.audio_response) {
                    console.log('Got audio response, adding to queue');
                    addToAudioQueue(data.audio_response);
                }
            }
        } else {
            console.log('Skipping invalid transcription:', transcription);
        }
    } catch (error) {
        console.error('Error sending audio to server:', error);
    }
  };

  // Helper function to format exercise names for display
  const formatExerciseName = (name) => {
    return name.split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
  };

  const stopWorkout = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
    }
    if (webcamRef.current && webcamRef.current.video.srcObject) {
      webcamRef.current.video.srcObject.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsStarted(false);
    setRecordingTime(0);
    setConversation([]);
  };

  useEffect(() => {
    return () => {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      if (webcamRef.current && webcamRef.current.video.srcObject) {
        webcamRef.current.video.srcObject.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleLandmarksUpdate = (landmarks) => {
    if (landmarks?.poseWorldLandmarks) {
      console.log("Received landmarks:", {
        landmarksCount: landmarks.poseWorldLandmarks.length,
        firstLandmark: landmarks.poseWorldLandmarks[0]
      });
      setPoseLandmarks(landmarks);
      
      // Add exercise detection
      const detection = exerciseDetectorRef.current.detectExercise(landmarks.poseWorldLandmarks);
      if (detection) {
          setExerciseState({
              currentExercise: detection.exercise,
              repCount: detection.repCount,
              form: detection.form,
              feedback: detection.feedback
          });
      }
    }
  };

  useEffect(() => {
    const playNextInQueue = async () => {
        if (audioQueue.length > 0 && !isPlaying) {
            setIsPlaying(true);
            const nextAudio = audioQueue[0];
            
            try {
                // Create audio from base64
                const audioData = atob(nextAudio);
                const arrayBuffer = new ArrayBuffer(audioData.length);
                const view = new Uint8Array(arrayBuffer);
                
                for (let i = 0; i < audioData.length; i++) {
                    view[i] = audioData.charCodeAt(i);
                }
                
                // Create blob and URL
                const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
                const audioUrl = URL.createObjectURL(blob);
                
                // Create and play audio
                const audio = new Audio(audioUrl);
                
                // Wait for audio to finish before playing next
                await new Promise((resolve, reject) => {
                    audio.oncanplay = () => {
                        console.log('Audio ready to play');
                        audio.play()
                            .then(() => console.log('Playing audio from queue'))
                            .catch(reject);
                    };
                    
                    audio.onerror = reject;
                    
                    audio.onended = () => {
                        URL.revokeObjectURL(audioUrl);
                        console.log('Audio finished, URL cleaned up');
                        resolve();
                    };
                });
                
            } catch (error) {
                console.error('Error playing queued audio:', error);
            } finally {
                handleAudioComplete();
            }
        }
    };
    
    playNextInQueue();
  }, [audioQueue, isPlaying]);
  
  const handleAudioComplete = useCallback(() => {
    setAudioQueue(prev => prev.slice(1)); // Remove played audio
    setIsPlaying(false);
  }, []);
  
  const addToAudioQueue = useCallback((audioData) => {
    setAudioQueue(prev => [...prev, audioData]);
    console.log('Added audio to queue, current length:', audioQueue.length + 1);
  }, [audioQueue]);

  return (
    <div className="workout-container">
      <div className="workout-content">
        {!isStarted ? (
          <div className="start-section">
            <h2>Ready to Begin Your Workout?</h2>
            <AudioControls 
              onVoiceChange={handleVoiceChange} 
            />
            <button className="workout-start-button" onClick={startWorkout}>
              Get Started
            </button>
          </div>
        ) : (
          <>
            <div className="workout-header">
              <h1>Your Workout Session</h1>
            </div>
            <div className="workout-display">
              <div className="video-view">
                <PoseDetection 
                  isStarted={isStarted} 
                  onLandmarksUpdate={handleLandmarksUpdate}
                />
              </div>
              <div className="skeleton-view">
                {poseLandmarks && (
                  <PoseDetection3D 
                    isStarted={isStarted} 
                    landmarks={poseLandmarks}
                  />
                )}
              </div>
            </div>
            <div className="workout-controls">
              <div className="recording-indicator">
                <div className="recording-dot"></div>
                <span>Recording Audio ({recordingTime}s)</span>
                <div className="audio-level">Level: {audioLevel.toFixed(1)}%</div>
              </div>
              <div className="conversation-box" ref={conversationBoxRef}>
                {conversation.map((message, index) => (
                  <div key={index} className={`message ${message.type}`}>
                    <div className="message-header">
                      {message.type === 'user' ? 'You' : 'AI Coach'}
                    </div>
                    <div className="message-content">{message.text}</div>
                  </div>
                ))}
              </div>
              <button className="workout-stop-button" onClick={stopWorkout}>
                End Workout
              </button>
              <div className="exercise-feedback">
                {exerciseState.currentExercise !== 'unknown' && (
                    <>
                        <div className="exercise-info">
                            <h3>Current Exercise: {exerciseState.currentExercise}</h3>
                            <p>Reps: {exerciseState.repCount}</p>
                            <p>Form: {exerciseState.form}</p>
                        </div>
                        {exerciseState.feedback.length > 0 && (
                            <div className="form-feedback">
                                <h4>Form Feedback:</h4>
                                <ul>
                                    {exerciseState.feedback.map((feedback, index) => (
                                        <li key={index}>{feedback}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default WorkoutPage;