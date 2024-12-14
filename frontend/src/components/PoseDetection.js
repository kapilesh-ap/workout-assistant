import React, { useRef, useEffect, useState } from 'react';
import Webcam from 'react-webcam';
import { Pose } from '@mediapipe/pose';
import * as poseDetection from '@tensorflow-models/pose-detection';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import { Camera } from '@mediapipe/camera_utils';
import '../styles/PoseDetection.css';

const PoseDetection = ({ isStarted, onLandmarksUpdate }) => {
  const webcamRef = useRef(null);
  const canvasRef = useRef(null);
  const poseDetectorRef = useRef(null);
  const mediaPipeRef = useRef(null);
  const cameraRef = useRef(null);
  const sideViewCanvasRef = useRef(null);
  const [isDetectorReady, setIsDetectorReady] = useState(false);
  const [useMediaPipe, setUseMediaPipe] = useState(true);

  const processFrame = async () => {
    if (!webcamRef.current?.video || !mediaPipeRef.current || !isStarted) return;

    try {
      await mediaPipeRef.current.send({ 
        image: webcamRef.current.video 
      });
    } catch (error) {
      console.error('Error processing frame:', error);
    }

    // Continue the detection loop
    if (isStarted) {
      requestAnimationFrame(processFrame);
    }
  };

  const initMediaPipe = async () => {
    try {
      console.log("Setting up MediaPipe Pose...");
      const pose = new Pose({
        locateFile: (file) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
        }
      });

      await pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      pose.onResults((results) => {
        console.log("MediaPipe Results:", {
          hasPoseLandmarks: Boolean(results.poseLandmarks),
          hasWorldLandmarks: Boolean(results.poseWorldLandmarks)
        });

        if (results.poseLandmarks && results.poseWorldLandmarks) {
          onLandmarksUpdate({
            poseLandmarks: results.poseLandmarks,
            poseWorldLandmarks: results.poseWorldLandmarks
          });
        }
      });

      mediaPipeRef.current = pose;

      // Start camera
      if (webcamRef.current && webcamRef.current.video) {
        const camera = new Camera(webcamRef.current.video, {
          onFrame: async () => {
            if (mediaPipeRef.current && webcamRef.current?.video) {
              await mediaPipeRef.current.send({ image: webcamRef.current.video });
            }
          },
          width: 640,
          height: 480
        });
        await camera.start();
        cameraRef.current = camera;
      }

      setIsDetectorReady(true);
    } catch (error) {
      console.error('Error initializing MediaPipe:', error);
    }
  };

  // Start detection when component mounts and isStarted is true
  useEffect(() => {
    if (isStarted && !isDetectorReady) {
      initMediaPipe();
    }

    // Cleanup function
    return () => {
      if (cameraRef.current) {
        cameraRef.current.stop();
      }
    };
  }, [isStarted]);

  return (
    <div className="pose-detection">
      <Webcam
        ref={webcamRef}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover'
        }}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
};

export default PoseDetection;