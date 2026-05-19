#!/bin/bash
# Generates atlas-config.js at Netlify build time from environment variables.
# Set ATLAS_APP_ID and ATLAS_API_KEY in Netlify UI → Site settings → Environment variables.
cat > atlas-config.js << EOF
window.ATLAS_CONFIG = {
  appId:      "${ATLAS_APP_ID}",
  apiKey:     "${ATLAS_API_KEY}",
  dataSource: "Cluster0",
  database:   "boxing",
  baseUrl:    "https://data.mongodb-api.com/app/${ATLAS_APP_ID}/endpoint/data/v1"
};
EOF
echo "atlas-config.js generated."
