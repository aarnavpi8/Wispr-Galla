# Galla on one Compute Engine VM: Docker Compose (db + api + web) behind Caddy (HTTPS).
# Keys live in Secret Manager; the VM reads them into .env on every (re)deploy.
#
#   cd deploy/gcp
#   terraform init
#   terraform apply -var project_id=YOUR_PROJECT
#
# See README.md in this folder for adding keys and redeploying.

terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
  zone    = var.zone
}

locals {
  name = "galla"
  # Free wildcard DNS: 34-93-1-2.sslip.io -> 34.93.1.2. Caddy gets a Let's Encrypt cert for it.
  domain = var.domain != "" ? var.domain : "${replace(google_compute_address.galla.address, ".", "-")}.sslip.io"

  # Every key the app understands (see .env.example). Values are added outside Terraform,
  # so they never end up in Terraform state or in git.
  secrets = toset([
    "LLM_PROVIDER",
    "LLM_API_KEY",
    "FIREBASE_API_KEY",
    "FIREBASE_AUTH_DOMAIN",
    "FIREBASE_PROJECT_ID",
    "FIREBASE_APP_ID",
  ])
}

# --- APIs --------------------------------------------------------------------------------

resource "google_project_service" "apis" {
  for_each           = toset(["compute.googleapis.com", "secretmanager.googleapis.com", "iap.googleapis.com"])
  service            = each.value
  disable_on_destroy = false
}

# --- Secrets (containers only; you add the values) ------------------------------------------

resource "google_secret_manager_secret" "keys" {
  for_each  = local.secrets
  secret_id = "galla-${lower(replace(each.value, "_", "-"))}"
  labels    = { app = local.name }
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# --- Identity for the VM: may read only these secrets and write logs -------------------------

resource "google_service_account" "vm" {
  account_id   = "${local.name}-vm"
  display_name = "Galla VM"
}

resource "google_secret_manager_secret_iam_member" "vm_reads_keys" {
  for_each  = google_secret_manager_secret.keys
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.vm.email}"
}

resource "google_project_iam_member" "vm_logs" {
  for_each = toset(["roles/logging.logWriter", "roles/monitoring.metricWriter"])
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.vm.email}"
}

# --- Network ---------------------------------------------------------------------------------

resource "google_compute_address" "galla" {
  name       = "${local.name}-ip"
  region     = var.region
  depends_on = [google_project_service.apis]
}

resource "google_compute_firewall" "web" {
  name          = "${local.name}-allow-web"
  network       = "default"
  direction     = "INGRESS"
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["${local.name}-web"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
  depends_on = [google_project_service.apis]
}

# SSH only through Identity-Aware Proxy (gcloud compute ssh --tunnel-through-iap).
resource "google_compute_firewall" "iap_ssh" {
  name          = "${local.name}-allow-iap-ssh"
  network       = "default"
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["${local.name}-web"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  depends_on = [google_project_service.apis]
}

# --- The VM ------------------------------------------------------------------------------------

resource "google_compute_instance" "galla" {
  name         = local.name
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["${local.name}-web"]

  boot_disk {
    initialize_params {
      image = "debian-cloud/debian-12"
      size  = var.disk_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network = "default"
    access_config {
      nat_ip = google_compute_address.galla.address
    }
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"] # access is limited by the IAM bindings above
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  metadata = {
    enable-oslogin = "TRUE"
    galla-repo     = var.repo_url
    galla-branch   = var.branch
    galla-domain   = local.domain
    galla-secrets  = join(" ", sort(tolist(local.secrets)))
    startup-script = file("${path.module}/startup.sh")
  }

  # Changing the startup script shouldn't recreate the VM; reboot or run redeploy.sh instead.
  lifecycle {
    ignore_changes = [metadata["startup-script"]]
  }

  depends_on = [
    google_secret_manager_secret_iam_member.vm_reads_keys,
    google_project_iam_member.vm_logs,
  ]
}
