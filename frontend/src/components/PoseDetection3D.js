import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Stats from 'three/examples/jsm/libs/stats.module';
import { POSE_LANDMARKS_LEFT, POSE_LANDMARKS_RIGHT } from '@mediapipe/pose';
import '../styles/PoseDetection3D.css';

const PoseDetection3D = ({ isStarted, landmarks }) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const statsRef = useRef(null);
  const skeletonRef = useRef(null);
  const animationFrameRef = useRef(null);
  const previousLandmarksRef = useRef(null);

  // Helper function to interpolate missing landmarks
  const interpolateMissingLandmarks = (currentLandmarks) => {
    const interpolatedLandmarks = [...currentLandmarks];
    const previousLandmarks = previousLandmarksRef.current;

    // Define landmark relationships for interpolation
    const landmarkRelations = {
      // Hips
      23: { connected: [24, 25], ratio: 0.5 },
      24: { connected: [23, 26], ratio: 0.5 },
      // Knees
      25: { connected: [23, 27], ratio: 0.7 },
      26: { connected: [24, 28], ratio: 0.7 },
      // Ankles
      27: { connected: [25, 31], ratio: 0.8 },
      28: { connected: [26, 32], ratio: 0.8 },
      // Shoulders
      11: { connected: [13, 23], ratio: 0.3 },
      12: { connected: [14, 24], ratio: 0.3 },
      // Elbows
      13: { connected: [11, 15], ratio: 0.6 },
      14: { connected: [12, 16], ratio: 0.6 },
      // Wrists
      15: { connected: [13, 17], ratio: 0.8 },
      16: { connected: [14, 18], ratio: 0.8 },
    };

    // Interpolate missing landmarks
    Object.entries(landmarkRelations).forEach(([index, relation]) => {
      index = parseInt(index);
      if (interpolatedLandmarks[index].visibility < 0.5) {
        const [p1, p2] = relation.connected;
        
        // Try to use connected landmarks if visible
        if (interpolatedLandmarks[p1]?.visibility > 0.5 && 
            interpolatedLandmarks[p2]?.visibility > 0.5) {
          interpolatedLandmarks[index] = {
            x: interpolatedLandmarks[p1].x + (interpolatedLandmarks[p2].x - interpolatedLandmarks[p1].x) * relation.ratio,
            y: interpolatedLandmarks[p1].y + (interpolatedLandmarks[p2].y - interpolatedLandmarks[p1].y) * relation.ratio,
            z: interpolatedLandmarks[p1].z + (interpolatedLandmarks[p2].z - interpolatedLandmarks[p1].z) * relation.ratio,
            visibility: 0.7 // Indicate this is an interpolated point
          };
        } 
        // Fall back to previous frame data if available
        else if (previousLandmarks?.[index]?.visibility > 0.5) {
          interpolatedLandmarks[index] = {
            ...previousLandmarks[index],
            visibility: 0.6 // Slightly lower confidence for historical data
          };
        }
      }
    });

    // Store current landmarks for next frame
    previousLandmarksRef.current = interpolatedLandmarks;
    return interpolatedLandmarks;
  };

  // Initialize scene
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene initialization code...
    const init = () => {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      sceneRef.current = scene;

      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
      camera.position.set(0, 1.5, 3);
      cameraRef.current = camera;

      const renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true 
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      containerRef.current.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;

      const stats = new Stats();
      containerRef.current.appendChild(stats.dom);
      statsRef.current = stats;

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(0, 10, 10);
      scene.add(directionalLight);

      // Grid helper
      const gridHelper = new THREE.GridHelper(10, 10);
      scene.add(gridHelper);

      // Animation loop
      const animate = () => {
        animationFrameRef.current = requestAnimationFrame(animate);
        if (controlsRef.current) controlsRef.current.update();
        if (statsRef.current) statsRef.current.update();
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
          rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      };
      animate();
    };

    init();

    // Cleanup function
    return () => {
      // Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Remove renderer
      if (rendererRef.current && containerRef.current) {
        const rendererDom = rendererRef.current.domElement;
        if (rendererDom.parentNode === containerRef.current) {
          containerRef.current.removeChild(rendererDom);
        }
        rendererRef.current.dispose();
      }

      // Remove stats
      if (statsRef.current && containerRef.current) {
        const statsDom = statsRef.current.dom;
        if (statsDom.parentNode === containerRef.current) {
          containerRef.current.removeChild(statsDom);
        }
      }

      // Dispose of controls
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }

      // Clear all refs
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      statsRef.current = null;
      skeletonRef.current = null;
    };
  }, []);

  // Update skeleton when landmarks change
  useEffect(() => {
    if (!landmarks?.poseWorldLandmarks || !sceneRef.current) return;

    const processedLandmarks = interpolateMissingLandmarks(landmarks.poseWorldLandmarks);

    // Remove existing skeleton
    if (skeletonRef.current) {
      sceneRef.current.remove(skeletonRef.current);
    }

    // Create new skeleton
    const skeleton = new THREE.Group();
    
    // Add joints
    const jointGeometry = new THREE.SphereGeometry(0.03);
    const jointMaterialReal = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const jointMaterialInterpolated = new THREE.MeshPhongMaterial({ color: 0xff8800 });

    processedLandmarks.forEach((landmark, index) => {
      if (landmark.visibility > 0.1) { // Lower threshold to show interpolated points
        const joint = new THREE.Mesh(
          jointGeometry, 
          landmark.visibility > 0.7 ? jointMaterialReal : jointMaterialInterpolated
        );
        joint.position.set(
          landmark.x,
          -landmark.y + 1,
          -landmark.z
        );
        skeleton.add(joint);
      }
    });

    // Enhanced connections list with left/right side distinction
    const connections = [
      // Torso
      [11, 12], [11, 23], [12, 24], [23, 24],
      // Left side
      [11, 13],      // shoulder to elbow
      [13, 15],      // elbow to wrist
      [23, 25],      // hip to knee
      [25, 27],      // knee to ankle
      // Right side
      [12, 14],      // shoulder to elbow
      [14, 16],      // elbow to wrist
      [24, 26],      // hip to knee
      [26, 28],      // knee to ankle
      // Face connections (if available)
      [0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8]
    ];

    // Add bones with different colors based on confidence
    const boneMatReal = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
    const boneMatInterpolated = new THREE.LineBasicMaterial({ color: 0xff8800, linewidth: 2 });

    connections.forEach(([i, j]) => {
      const start = processedLandmarks[i];
      const end = processedLandmarks[j];
      
      if (start && end && start.visibility > 0.1 && end.visibility > 0.1) {
        const points = [
          new THREE.Vector3(start.x, -start.y + 1, -start.z),
          new THREE.Vector3(end.x, -end.y + 1, -end.z)
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = (start.visibility > 0.7 && end.visibility > 0.7) ? 
          boneMatReal : boneMatInterpolated;
        const line = new THREE.Line(geometry, material);
        skeleton.add(line);
      }
    });

    skeletonRef.current = skeleton;
    sceneRef.current.add(skeleton);

    // Adjust camera - modified position
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 1.5, 2.5); // Changed from 2.2 to 2.5 for slightly more distance
      cameraRef.current.lookAt(0, 1.5, 0);
    }
  }, [landmarks]);

  // Add resize handler
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      
      const width = containerRef.current.clientWidth;
      const height = containerRef.current.clientHeight;
      
      cameraRef.current.aspect = width / height;
      cameraRef.current.updateProjectionMatrix();
      
      rendererRef.current.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <div ref={containerRef} className="viewport" />;
};

export default PoseDetection3D;