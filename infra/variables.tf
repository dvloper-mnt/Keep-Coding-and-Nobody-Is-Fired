variable "aws_region" {
  type        = string
  description = "AWS region for all resources."
  default     = "us-east-1"
}

variable "service_name" {
  type        = string
  description = "Name of the ECS Express Mode service and ECR repository."
  default     = "keep-coding-game"
}

variable "image_tag" {
  type        = string
  description = "Image tag to deploy from ECR (set by CI to the commit SHA)."
  default     = "latest"
}

variable "kv_rest_api_url" {
  type        = string
  description = "Upstash Redis REST URL for session persistence. Provided via TF_VAR_kv_rest_api_url or a gitignored .tfvars."
  sensitive   = true
}

variable "kv_rest_api_token" {
  type        = string
  description = "Upstash Redis REST token. Provided via TF_VAR_kv_rest_api_token or a gitignored .tfvars."
  sensitive   = true
}

variable "github_repo" {
  type        = string
  description = "GitHub repo in owner/name form, used to scope the OIDC trust policy."
  default     = "MoisesCorcho/Hackacthon"
}
