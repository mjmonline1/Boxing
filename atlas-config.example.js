// atlas-config.example.js — template only, safe to commit
// Copy this file to atlas-config.js and fill in your real values.
// atlas-config.js is gitignored — never commit real credentials.
//
// How to get these values:
//   1. Atlas UI → left nav "Data Services" → your cluster → "..." → Data API
//      (or: Atlas UI → App Services → Data API tab)
//   2. Enable the Data API if not already on
//   3. Copy the App ID shown on the Data API page
//   4. Click "Create API Key" — copy it now, it won't be shown again
//   5. dataSource = your cluster name (default: "Cluster0")
//   6. Paste your App ID into the baseUrl below (replace YOUR_APP_ID in both places)
//
// CORS: In Atlas Data API settings, add allowed origins:
//   https://<your-github-username>.github.io
//   http://localhost:5500

window.ATLAS_CONFIG = {
  appId:      'YOUR_APP_ID',
  apiKey:     'YOUR_API_KEY',
  dataSource: 'Cluster0',
  database:   'boxing',
  baseUrl:    'https://data.mongodb-api.com/app/YOUR_APP_ID/endpoint/data/v1'
};
