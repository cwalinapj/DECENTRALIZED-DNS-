terraform {
  required_version = ">= 1.5.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Placeholder resource to ensure provider wiring works.
# Replace with real resources as environments are defined.
resource "cloudflare_account" "placeholder" {
  count = 0
}
