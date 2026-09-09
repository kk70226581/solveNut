// src/index.js or main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './App.css';
import App from './App';
import './styles/ui-polish.css';
import './styles/workspace.css';

// OPTIONAL: one global reset/theme file only
// import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
