/* AquaSmart — Backend API URL Config
   After deploying backend to Render, paste your Render URL below */

const BACKEND_URL = (() => {
  // Local development
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }
  // Production — Render backend
  return 'https://aqua-smart-api-z4e3.onrender.com';
})();
