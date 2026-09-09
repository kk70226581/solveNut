// Use one backend for account data, messaging, and call signaling.
export const API = (import.meta.env.VITE_API_BASE ||
  (import.meta.env.DEV ? 'http://localhost:3000' : 'https://solutionhub66.onrender.com')).replace(/\/$/, '');
