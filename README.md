# devsaas-devops-examples

Working, runnable code examples that accompany deep-dive articles on **[devsaas.dev/blog](https://devsaas.dev/blog)**.

Each article on DevSaaS walks through *why* a problem happens and how to reason about it. This repo is the companion: the actual code you can clone, run with `docker compose up`, and poke at — so you're not copy-pasting snippets out of a blog post and hoping they work.

## Examples

| Folder | Article | What it demonstrates |
|---|---|---|
| [`jwt-revocation-redis/`](./jwt-revocation-redis) | [Revoke a JWT Before It Expires](https://devsaas.dev/blog/revoke-jwt-before-expiration) | Redis-backed token blacklist with automatic TTL cleanup |
| [`refresh-token-reuse-detection/`](./refresh-token-reuse-detection) | [Detecting Refresh Token Reuse with Redis](https://devsaas.dev/blog/detect-refresh-token-reuse-redis) | Redis-backed token family rotation and reuse detection |
| [`kubernetes-hpa-scaling-demo/`](./kubernetes-hpa-scaling-demo) | [Kubernetes HPA Not Scaling Down](https://devsaas.dev/blog/kubernetes-hpa-not-scaling-down) | Reproducing and fixing the scale-down stabilization window issue |

## Running any example

Each folder is self-contained:

```bash
cd jwt-revocation-redis
docker compose up -d      # starts Redis
npm install
npm start
```

Every example folder has its own README with the exact endpoints to hit and what to expect.

## Why this repo exists

Most "JWT tutorial" code online either skips revocation entirely or hand-waves the storage layer. These examples show the actual Redis data structures, TTL strategy, and edge cases (clock skew, race conditions on logout, token family invalidation) that the DevSaaS articles discuss in depth.

## Stack

- Node.js 20+
- Express
- Redis 7 (via `ioredis`)
- Docker Compose for local Redis

## License

MIT — use it, fork it, adapt it to your own stack.


## More

Full write-ups, troubleshooting guides, and architecture breakdowns: **[devsaas.dev/blog](https://devsaas.dev/blog)**
