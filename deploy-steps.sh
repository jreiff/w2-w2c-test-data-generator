#!/bin/bash
# Fly.io Deployment Steps for W2/W2C Test Data Generator

echo "🚀 Starting Fly.io Deployment..."
echo ""

# Step 1: Authenticate (opens browser)
echo "Step 1: Authenticating with Fly.io..."
echo "This will open a browser window for authentication."
flyctl auth login

# Step 2: Launch the app (creates app if needed)
echo ""
echo "Step 2: Launching the app..."
echo "If prompted, you can:"
echo "  - Use the app name: w2-w2c-generator (or choose your own)"
echo "  - Select a region (e.g., iad for Washington DC, ord for Chicago)"
flyctl launch --no-deploy

# Step 3: Deploy
echo ""
echo "Step 3: Deploying the application..."
flyctl deploy

# Step 4: Open the app
echo ""
echo "Step 4: Opening your app..."
flyctl open

echo ""
echo "✅ Deployment complete!"
echo "Your app should now be running at: https://w2-w2c-generator.fly.dev"
