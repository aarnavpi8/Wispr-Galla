variable "project_id" {
  description = "GCP project to deploy into (billing must be enabled)."
  type        = string
}

variable "region" {
  description = "Region. asia-south1 is Mumbai, closest to the shops."
  type        = string
  default     = "asia-south1"
}

variable "zone" {
  type    = string
  default = "asia-south1-a"
}

variable "machine_type" {
  description = "e2-medium (2 vCPU, 4 GB) builds the Next.js image comfortably. e2-small needs the swap file and is slow."
  type        = string
  default     = "e2-medium"
}

variable "disk_gb" {
  type    = number
  default = 30
}

variable "repo_url" {
  description = "Public git repo the VM clones."
  type        = string
  default     = "https://github.com/aarnavpi8/Wispr-Galla.git"
}

variable "branch" {
  type    = string
  default = "main"
}

variable "domain" {
  description = "Your own domain pointed at the IP (A record). Empty = free <ip>.sslip.io domain."
  type        = string
  default     = ""
}
