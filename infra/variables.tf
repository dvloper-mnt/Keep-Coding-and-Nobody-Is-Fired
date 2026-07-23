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

# The dvloper-mnt org emits an OIDC subject with immutable numeric IDs
# (repo:<org>@<orgId>/<repo>@<repoId>:ref:...), so the trust policy must match
# that exact prefix rather than the classic repo:<org>/<repo> form. Confirmed via
# GET /repos/.../actions/oidc/customization/sub (sub_claim_prefix).
variable "github_oidc_sub_pattern" {
  type        = string
  description = "StringLike pattern matched against the GitHub OIDC token sub claim."
  default     = "repo:MoisesCorcho/Hackacthon:*"
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

variable "bedrock_model_id" {
  type        = string
  description = "Bedrock inference profile used for generation (also the CloudWatch metric dimension)."
  default     = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
}

# Used only for the estimated-cost widget on the dashboard. Update if AWS pricing
# changes or the model changes. Defaults are Claude Haiku 4.5 (us-east-1, USD/1M tokens).
variable "bedrock_input_price_per_1m" {
  type        = number
  description = "USD per 1M input tokens for the Bedrock model (dashboard cost estimate only)."
  default     = 1.0
}

variable "bedrock_output_price_per_1m" {
  type        = number
  description = "USD per 1M output tokens for the Bedrock model (dashboard cost estimate only)."
  default     = 5.0
}
