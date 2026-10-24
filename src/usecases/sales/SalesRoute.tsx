import React from 'react';
import { useNavigate } from 'react-router-dom';
import SalesAgentPage from './SalesAgentPage';

const SalesRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <SalesAgentPage
      onOpenTracker={() => navigate('/sales/tracker')}
      onBack={() => navigate('/')}
    />
  );
};

export default SalesRoute;
