import React, { forwardRef, useImperativeHandle, useRef,useState } from 'react';
import '../styles/AudioControls.css';

const AudioControls = forwardRef(({ onVoiceChange }, ref) => {
  const audioRef = useRef(new Audio());
  const [volume, setVolume] = useState(1.0);

  useImperativeHandle(ref, () => ({
    playAudioResponse: (audioData) => {
      try {
        // Convert base64 to blob
        const audioBlob = new Blob(
          [Uint8Array.from(atob(audioData), c => c.charCodeAt(0))],
          { type: 'audio/mp3' }
        );
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Set up audio playback
        audioRef.current.src = audioUrl;
        audioRef.current.volume = volume;
        
        // Play the audio
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
        });

        // Cleanup URL after playback
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
        };
      } catch (error) {
        console.error('Error setting up audio playback:', error);
      }
    }
  }));

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    audioRef.current.volume = newVolume;
  };

  return (
    <div className="audio-controls">
      <div className="voice-select">
        <label htmlFor="voice-select">Voice:</label>
        <select 
          id="voice-select"
          onChange={(e) => onVoiceChange(e.target.value)}
          defaultValue="en-us"
        >
          <option value="en-us">English (US)</option>
          <option value="en-gb">English (UK)</option>
          <option value="es">Spanish</option>
          <option value="fr">French</option>
          <option value="de">German</option>
        </select>
      </div>

      <div className="volume-control">
        <label htmlFor="volume-slider">Volume:</label>
        <input
          id="volume-slider"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={handleVolumeChange}
        />
      </div>
    </div>
  );
});

export default AudioControls;