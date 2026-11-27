output "ip" {
  description = "Static external IP of the VM."
  value       = google_compute_address.galla.address
}

output "url" {
  description = "Open this. HTTPS (needed for the mic, camera and Google login)."
  value       = "https://${local.domain}"
}

output "secret_names" {
  description = "Secret Manager secrets the VM reads. Add a value to any of them, then redeploy."
  value       = sort([for s in google_secret_manager_secret.keys : s.secret_id])
}

output "add_a_key" {
  description = "Example: store an API key (PowerShell). Repeat for any secret_names entry."
  value       = "\"YOUR-KEY\" | gcloud secrets versions add galla-llm-api-key --data-file=- --project ${var.project_id}"
}

output "redeploy" {
  description = "Pull latest code + secrets and restart the app on the VM."
  value       = "gcloud compute ssh ${google_compute_instance.galla.name} --zone ${var.zone} --project ${var.project_id} --tunnel-through-iap --command \"sudo /opt/galla/deploy/gcp/redeploy.sh\""
}

output "startup_log" {
  description = "Watch the first boot (Docker install + build takes ~5-8 minutes)."
  value       = "gcloud compute ssh ${google_compute_instance.galla.name} --zone ${var.zone} --project ${var.project_id} --tunnel-through-iap --command \"sudo tail -f /var/log/galla-deploy.log\""
}
