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

variable "github_repo" {
  type        = string
  description = "GitHub repo in owner/name form, used to scope the OIDC trust policy."
  default     = "MoisesCorcho/Hackacthon"
}
