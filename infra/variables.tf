variable "aws_region" {
  type        = string
  description = "AWS region for all resources."
  default     = "us-east-1"
}

variable "service_name" {
  type        = string
  description = "Name of the ECS service and ECR repository."
  default     = "keep-coding-game"
}

variable "image_tag" {
  type        = string
  description = "Image tag to deploy from ECR (set by CI to the commit SHA)."
  default     = "latest"
}

variable "container_port" {
  type        = number
  description = "Port the Next.js server listens on inside the container."
  default     = 3000
}

variable "github_repo" {
  type        = string
  description = "GitHub repo in owner/name form, used to scope the OIDC trust policy."
  default     = "MoisesCorcho/Hackacthon"
}

variable "domain_name" {
  type        = string
  description = "Custom domain that serves the app over HTTPS."
  default     = "hackaton.dvloper.com.co"
}

variable "bedrock_timeout_ms" {
  type        = number
  description = "Timeout for the runtime Bedrock challenge generation. Generation measured at 13-14s, so this must clear that with margin."
  default     = 20000
}
