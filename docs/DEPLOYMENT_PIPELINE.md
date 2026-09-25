# Deployment pipeline (tms.ather-ai.com)

Every change reaches production the same way:

1. **PR.** `test`, `build` and `e2e` must pass before `main` accepts it (branch protection).
2. **Merge to main.** The same three checks run again on the merged code.
3. **Approval.** The `deploy` job targets the `production` GitHub environment. It pauses there, and GitHub emails the required reviewers a **Review deployments** link. Approve from the web or the GitHub mobile app. Reject, or leave it for 30 days, and nothing ships.
4. **Deploy** (`.github/workflows/test.yml`, job `deploy`):
   - Assumes the `ather-tms-github-deploy` AWS role over OIDC. There are no stored AWS keys, and the role only trusts jobs running in this repo's `production` environment. The trust policy matches GitHub's immutable subject format (`repo:<owner>@<owner-id>/<repo>@<repo-id>:environment:production`), which this repo has enabled.
   - Builds the backend and frontend images from the same Dockerfiles and cache the `e2e` job tested, tags them with the commit SHA (and `latest`), and pushes them to ECR.
   - Rolls the backend service, then the frontend, onto the new images with `scripts/deploy/ecs-deploy.sh`, and waits for each to become stable.
   - Runs the read-only smoke suite (`e2e/tests/smoke.spec.ts`) against https://tms.ather-ai.com.

## When something goes wrong

| Failure | What happens |
|---|---|
| A check fails on the PR or on main | Deploy never starts. |
| New tasks never become healthy | The ECS deployment circuit breaker rolls the service back to the previous task definition, and the job fails. |
| New version is live but the smoke test fails | The job puts both services back on their previous task definitions (`scripts/deploy/ecs-rollback.sh`). |

Rollbacks restore code, not data. The backend runs `prisma migrate deploy` on start, so **migrations must stay backwards-compatible with the previous release**: add columns and tables, and don't rename or drop in the same release that stops using them.

## Rolling back by hand

Each deploy's job summary lists the task definitions it moved from and to. To go back to an earlier release:

```bash
aws ecs update-service --cluster ather-tms-cluster --service ather-tms-backend --task-definition ather-tms-backend:<revision>
aws ecs update-service --cluster ather-tms-cluster --service ather-tms-frontend --task-definition ather-tms-frontend:<revision>
```

Or revert the commit on `main` and approve the resulting deploy.

## One-time setup

- `cloudformation.yaml` creates the GitHub OIDC provider (unless `GitHubOIDCProviderArn` points at an existing one) and the deploy role. Its `GitHubDeployRoleArn` output goes in the repo variable `AWS_DEPLOY_ROLE_ARN`.
- GitHub → Settings → Environments → `production`: required reviewers, deployment branches limited to `main`.
- Reviewers get the email only if GitHub notifications for Actions are enabled (Settings → Notifications).

The CodeBuild project in the stack still works as a manual fallback. It pushes `latest`, which the CloudFormation task definitions reference.

## Secrets

The backend's secrets live in Secrets Manager, not in the task definition:

| Secret | Env var | Notes |
|---|---|---|
| `ather-tms/database-url` | `DATABASE_URL` | Built from the stack's `DBPassword` parameter. |
| `ather-tms/jwt-secret` | `JWT_SECRET` | Changing it logs every user out. |
| `ather-tms/credentials-encryption-key` | `CREDENTIALS_ENCRYPTION_KEY` | Encrypts stored carrier/integration credentials. Once any are stored, changing it makes them unreadable. |

The task definition holds only their ARNs (`secrets[].valueFrom`), and ECS injects the values at task start using the task execution role. The deploy script copies the `secrets` block unchanged, so deploys need no secret access.

## Public logs

This repository is public, so Actions logs are too. Task definitions contain secret ARNs, not values, but the deploy scripts still never print them.
