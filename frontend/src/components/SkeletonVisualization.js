import React, { useRef, useEffect } from 'react';

const SkeletonVisualization = ({ landmarks }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !landmarks) return;

    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set up 3D visualization parameters
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const scale = canvas.height * 0.4;
    const rotationY = Math.PI / 6; // 30-degree rotation for perspective

    // Define skeleton connections
    const connections = [
      // Torso
      [11, 12], [11, 23], [12, 24], [23, 24],
      // Arms
      [11, 13], [13, 15], [12, 14], [14, 16],
      // Legs
      [23, 25], [25, 27], [24, 26], [26, 28],
      // Face connections
      [0, 1], [1, 4], [4, 7], [7, 8], [0, 8]
    ];

    // Function to apply 3D rotation
    const rotate3D = (x, y, z) => {
      const cosY = Math.cos(rotationY);
      const sinY = Math.sin(rotationY);
      
      const rotatedX = x * cosY + z * sinY;
      const rotatedZ = -x * sinY + z * cosY;
      
      return {
        x: rotatedX,
        y: y,
        z: rotatedZ
      };
    };

    // Draw connections
    connections.forEach(([i, j]) => {
      const start = landmarks[i];
      const end = landmarks[j];

      if (start && end && start.visibility > 0.5 && end.visibility > 0.5) {
        // Apply 3D rotation and projection
        const startPos = rotate3D(
          (start.x - 0.5) * scale,
          (start.y - 0.5) * scale,
          start.z * scale
        );
        const endPos = rotate3D(
          (end.x - 0.5) * scale,
          (end.y - 0.5) * scale,
          end.z * scale
        );

        // Create depth-based gradient
        const gradient = ctx.createLinearGradient(
          centerX + startPos.x,
          centerY + startPos.y,
          centerX + endPos.x,
          centerY + endPos.y
        );

        // Calculate opacity based on Z position
        const startOpacity = Math.max(0.2, 1 - Math.abs(startPos.z) / scale);
        const endOpacity = Math.max(0.2, 1 - Math.abs(endPos.z) / scale);

        gradient.addColorStop(0, `rgba(0, 255, 255, ${startOpacity})`);
        gradient.addColorStop(1, `rgba(0, 255, 255, ${endOpacity})`);

        // Draw connection with glow effect
        ctx.beginPath();
        ctx.moveTo(centerX + startPos.x, centerY + startPos.y);
        ctx.lineTo(centerX + endPos.x, centerY + endPos.y);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.shadowColor = 'rgba(0, 255, 255, 0.5)';
        ctx.shadowBlur = 10;
        ctx.stroke();
      }
    });

    // Draw joints
    landmarks.forEach(landmark => {
      if (landmark.visibility > 0.5) {
        const pos = rotate3D(
          (landmark.x - 0.5) * scale,
          (landmark.y - 0.5) * scale,
          landmark.z * scale
        );

        const depth = Math.max(0.2, 1 - Math.abs(pos.z) / scale);
        const size = Math.max(3, 6 - Math.abs(pos.z) / 100);

        // Draw joint with glow effect
        ctx.beginPath();
        ctx.arc(centerX + pos.x, centerY + pos.y, size, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(255, 0, 0, ${depth})`;
        ctx.shadowColor = 'rgba(255, 0, 0, 0.5)';
        ctx.shadowBlur = 15;
        ctx.fill();
      }
    });
  }, [landmarks]);

  return <canvas ref={canvasRef} className="skeleton-canvas" />;
};

export default SkeletonVisualization;