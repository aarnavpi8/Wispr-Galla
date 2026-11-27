# Deploy Galla on GCP Compute Engine

One small VM runs the same Docker Compose stack the judges run, plus nginx (rate limits,
security headers, HTTPS) and certbot (Let's Encrypt).
API keys live in **Secret Manager**, never in git or Terraform state.

```
Internet ──443/80──▶ nginx ──▶ web (Next.js :3000) ──▶ api (FastAPI :8000) ──▶ db (Postgres)
                      │  rate limits · headers · gzip · TLS
                      └─ certbot: free domain <ip>.sslip.io, Let's Encrypt cert, auto-renew
VM identity ──reads──▶ Secret Manager: galla-wispr-api-key, galla-firebase-api-key, …
```

## 1. Create it (once)

Needs `terraform` and `gcloud` (signed in: `gcloud auth application-default login`), and a
project with billing on.

```powershell
cd deploy/gcp
terraform init
terraform apply -var project_id=YOUR_PROJECT
```

It prints the `url` (for example `https://34-93-12-34.sslip.io`). The first boot installs Docker
and builds the app: give it **5 to 8 minutes**. Watch it with the `startup_log` command it prints.

Cost: roughly e2-medium + 30 GB disk + a static IP, about US$30/month in asia-south1.
`terraform destroy -var project_id=YOUR_PROJECT` removes everything.

## 2. Add API keys for testing

Terraform creates empty secrets. Add a value to any of them (PowerShell):

```powershell
"fl-your-wispr-key" | gcloud secrets versions add galla-wispr-api-key --data-file=- --project YOUR_PROJECT
```

| Secret | What it turns on |
|---|---|
| `galla-wispr-api-key` | In-app mic via Wispr Flow speech-to-text |
| `galla-llm-provider`, `galla-llm-api-key` | LLM upgrade for understanding entries (D2/D3; not used until flow 1 lands) |
| `galla-firebase-api-key`, `-auth-domain`, `-project-id`, `-app-id` | Google login (D14) |

Then apply them (pulls the latest `main` too):

```powershell
gcloud compute ssh galla --zone asia-south1-a --project YOUR_PROJECT --tunnel-through-iap --command "sudo /opt/galla/deploy/gcp/redeploy.sh"
```

The log shows `NAME: set` or `NAME: empty` for each key (never the value). To remove a key,
disable its latest version in the console (Security → Secret Manager) and redeploy.

**Google login:** also add the sslip.io domain under Firebase console → Authentication →
Settings → Authorized domains.

## 3. Update the app

Push to `main`, then run the redeploy command above. Rebooting the VM does the same.

## Your own domain

Point an A record at the `ip` output, then `terraform apply -var project_id=… -var domain=galla.example.com`
(this changes VM metadata only) and redeploy. certbot fetches the certificate itself.

## nginx: rate limits and protection

`deploy/gcp/nginx/templates/default.conf.template` (per client IP):

| Path | Limit | Why |
|---|---|---|
| `/api/transcribe` | 12/min, burst 6 | Wispr Flow is billed per use |
| `/api/*` | 10/s, burst 40 | dashboard API calls |
| pages, `/_next/static` | 20/s, burst 80–120 | a page load pulls many files |
| connections | 40 open per IP | |

Over the limit: HTTP 429 with `{"detail": "Too many requests…"}`. Also: request bodies capped
at 6 MB, slow-client timeouts, HSTS / nosniff / frame / referrer headers, and a
Permissions-Policy that allows the mic and camera for this site only. HTTP redirects to HTTPS.
Until Let's Encrypt has issued the certificate (about a minute after first boot) nginx serves a
self-signed one; it switches to the real one by itself within 5 minutes.
