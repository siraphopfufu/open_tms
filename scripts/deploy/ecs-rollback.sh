#!/usr/bin/env bash
# Usage: ecs-rollback.sh <cluster> <service> <task-definition-arn>
set -euo pipefail
cluster=$1 service=$2 target=$3
[ -n "$target" ] || { echo "No previous task definition for $service; nothing to roll back"; exit 0; }
echo "Rolling $service back to ${target##*/}"
aws ecs update-service --cluster "$cluster" --service "$service" --task-definition "$target" \
  --query 'service.serviceName' --output text >/dev/null
aws ecs wait services-stable --cluster "$cluster" --services "$service"
