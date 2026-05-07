import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3500,
        style: {
          background: 'rgba(15,21,48,0.95)',
          color: '#dde1ee',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(12px)',
          borderRadius: '12px',
          boxShadow: '0 16px 40px -8px rgba(0,0,0,0.6)',
          fontSize: '14px',
        },
        success: { iconTheme: { primary: '#7de4be', secondary: '#0f1530' } },
        error:   { iconTheme: { primary: '#ff9bb0', secondary: '#0f1530' } },
      }}
    />
  </BrowserRouter>
);
