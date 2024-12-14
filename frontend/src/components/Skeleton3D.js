import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

const Skeleton3D = ({ landmarks }) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const skeletonRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Setup scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    sceneRef.current = scene;

    // Setup camera
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 3);
    cameraRef.current = camera;

    // Setup renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Add controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    // Add grid
    const grid = new THREE.GridHelper(4, 10);
    scene.add(grid);

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!landmarks || !sceneRef.current) return;

    // Remove existing skeleton
    if (skeletonRef.current) {
      sceneRef.current.remove(skeletonRef.current);
    }

    // Create new skeleton
    const skeleton = new THREE.Group();
    skeletonRef.current = skeleton;

    // Create joints and bones
    landmarks.forEach((landmark) => {
      if (landmark.score > 0.3) {
        const geometry = new THREE.SphereGeometry(0.03);
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const joint = new THREE.Mesh(geometry, material);
        joint.position.set(
          (landmark.x - 0.5) * 2,
          -(landmark.y - 0.5) * 2,
          0
        );
        skeleton.add(joint);
      }
    });

    sceneRef.current.add(skeleton);
  }, [landmarks]);

  return <div ref={containerRef} style={{ width: '300px', height: '300px' }} />;
};

export default Skeleton3D;