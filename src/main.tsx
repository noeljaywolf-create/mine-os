import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import '@xyflow/react/dist/style.css';
import './index.css';

import { AppShell } from './app/AppShell';
import { CapabilityProvider } from './design-system';
import { useCapabilities, useSimulationDriver } from './store/hooks';
import type { Capability } from './domain/types';
import { LandingPage } from './website/LandingPage';

import { MissionControl } from './modules/MissionControl';
import { DigitalTwin } from './modules/DigitalTwin';
import { Dewatering } from './modules/Dewatering';
import { MineImpact } from './modules/MineImpact';
import { Incidents } from './modules/Incidents';
import { Energy } from './modules/Energy';
import { Production } from './modules/Production';
import { Scenarios } from './modules/Scenarios';
import { Forecast } from './modules/Forecast';
import { Assets } from './modules/Assets';
import { Telemetry } from './modules/Telemetry';
import { Decisions } from './modules/Decisions';
import { Analytics } from './modules/Analytics';
import { Governance } from './modules/Governance';

function Root() {
  const capabilities = useCapabilities();
  useSimulationDriver();

  return (
    <CapabilityProvider can={(capability) => capabilities.can(capability as Capability)}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<MissionControl />} />
          <Route path="digital-twin" element={<DigitalTwin />} />
          <Route path="dewatering" element={<Dewatering />} />
          <Route path="impact" element={<MineImpact />} />
          <Route path="incidents" element={<Incidents />} />
          <Route path="energy" element={<Energy />} />
          <Route path="production" element={<Production />} />
          <Route path="scenarios" element={<Scenarios />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="assets" element={<Assets />} />
          <Route path="telemetry" element={<Telemetry />} />
          <Route path="decisions" element={<Decisions />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="governance" element={<Governance />} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CapabilityProvider>
  );
}

const basePath = new URL('.', document.baseURI).pathname.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basePath || '/'}>
      <Root />
    </BrowserRouter>
  </React.StrictMode>,
);
