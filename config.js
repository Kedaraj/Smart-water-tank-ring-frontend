/* AquaSmart — Backend API URL Config
   After deploying backend to Render, paste your Render URL below */

const BACKEND_URL = (() => {
  // Local development
  if (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }
  // Production — update this with your Render backend URL
  return 'https://aquasmart-api.onrender.com';
})();
