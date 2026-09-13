#!/bin/bash

# Ather TMS Webhook Service Deployment Script
# This script deploys the webhook service to Google Cloud Functions

set -e

echo "🚀 Deploying Ather TMS Webhook Service to Google Cloud Functions..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ Error: gcloud CLI is not installed. Please install it first."
    echo "   Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 &> /dev/null; then
    echo "❌ Error: Not authenticated with gcloud. Please run 'gcloud auth login'"
    exit 1
fi

# Set default values
FUNCTION_NAME="ather-tms-webhook"
REGION="us-central1"
MEMORY="256MB"
TIMEOUT="60s"
RUNTIME="nodejs20"

# Get the API key from .env file
if [ -f ".env" ]; then
    API_KEY=$(grep "WEBHOOK_API_KEY=" .env | cut -d '=' -f2)
    if [ -z "$API_KEY" ]; then
        echo "❌ Error: WEBHOOK_API_KEY not found in .env file"
        exit 1
    fi
else
    echo "❌ Error: .env file not found"
    exit 1
fi

echo "📦 Deploying function: $FUNCTION_NAME"
echo "🌍 Region: $REGION"
echo "💾 Memory: $MEMORY"
echo "⏱️  Timeout: $TIMEOUT"
echo "🔧 Runtime: $RUNTIME"

# Deploy the function
gcloud functions deploy $FUNCTION_NAME \
    --runtime=$RUNTIME \
    --trigger-http \
    --allow-unauthenticated \
    --memory=$MEMORY \
    --timeout=$TIMEOUT \
    --region=$REGION \
    --source=. \
    --entry-point=webhook \
    --set-env-vars="WEBHOOK_API_KEY=$API_KEY,NODE_ENV=production" \
    --max-instances=10

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "🔗 Function URL:"
    gcloud functions describe $FUNCTION_NAME --region=$REGION --format="value(httpsTrigger.url)"
    echo ""
    echo "📋 Test the function with:"
    FUNCTION_URL=$(gcloud functions describe $FUNCTION_NAME --region=$REGION --format="value(httpsTrigger.url)")
    echo "curl -X POST '$FUNCTION_URL' \\"
    echo "  -H 'Content-Type: application/json' \\"
    echo "  -H 'x-api-key: $API_KEY' \\"
    echo "  -d '{\"test\": \"data\", \"shipment_id\": \"SH-001\", \"lat\": 33.4484, \"lng\": -112.0740}'"
    echo ""
    echo "🔧 To update environment variables:"
    echo "gcloud functions deploy $FUNCTION_NAME --update-env-vars='WEBHOOK_API_KEY=new_key'"
    echo ""
    echo "📊 To view logs:"
    echo "gcloud functions logs read $FUNCTION_NAME --region=$REGION"
else
    echo "❌ Deployment failed!"
    exit 1
fi