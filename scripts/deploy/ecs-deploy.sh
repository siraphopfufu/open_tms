#!/usr/bin/env bash
# Usage: ecs-deploy.sh <cluster> <service> <container> <image>
#
# Registers a copy of the service's current task definition with <container>
# pointed at <image>, rolls the service onto it, and waits until it is stable.
# Writes `previous` and `current` task-definition ARNs to $GITHUB_OUTPUT so a
# later step can roll back.
#
# The repo is public, so Actions logs are public: the task definition holds
# DATABASE_URL and JWT_SECRET, and must never be echoed.
set -euo pipefail
cluster=$1 service=$2 container=$3 image=$4

previous=$(aws ecs describe-services --cluster "$cluster" --services "$service" \
  --query 'services[0].taskDefinition' --output text)

new_def=$(aws ecs describe-task-definition --task-definition "$previous" --query taskDefinition --output json |
  jq --arg c "$container" --arg img "$image" '
    .containerDefinitions |= map(if .name == $c then .image = $img else . end)
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
          .registeredAt, .registeredBy, .deregisteredAt)')

current=$(aws ecs register-task-definition --cli-input-json "$new_def" \
  --query 'taskDefinition.taskDefinitionArn' --output text)
unset new_def

echo "previous=$previous" >> "$GITHUB_OUTPUT"
echo "current=$current" >> "$GITHUB_OUTPUT"
echo "Deploying $service: ${previous##*/} -> ${current##*/}"

aws ecs update-service --cluster "$cluster" --service "$service" --task-definition "$current" \
  --query 'service.deployments[0].id' --output text >/dev/null

# Wait for this deployment to finish. The circuit breaker marks it FAILED
# (and rolls back) if new tasks can't get healthy.
for _ in $(seq 1 60); do
  state=$(aws ecs describe-services --cluster "$cluster" --services "$service" \
    --query "services[0].deployments[?taskDefinition=='$current'] | [0].rolloutState" --output text)
  case "$state" in
    COMPLETED) echo "$service is live on ${current##*/}"; exit 0 ;;
    FAILED)    echo "::error::$service deployment failed; ECS rolled back to ${previous##*/}"; exit 1 ;;
  esac
  sleep 15
done
echo "::error::$service did not stabilise within 15 minutes"; exit 1
