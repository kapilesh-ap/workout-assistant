import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LandingPage.css';

const LandingPage = () => {
  const navigate = useNavigate();

  const handleGetStarted = () => {
    navigate('/workout');
  };

  return (
    <div className="landing-container">
      <div className="content">
        <h1 className="title">
          Athlet<span className="highlight">IQ</span>
        </h1>
        <button className="start-button" onClick={handleGetStarted}>
          Get Started
          <span className="button-glow"></span>
        </button>
      </div>
      <div className="gradient-overlay"></div>
      <div className="animated-bg"></div>
    </div>
  );
};

export default LandingPage;