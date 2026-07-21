output "app_url" {
  description = "Public URL of the app (ALB, HTTP)."
  value       = "http://${aws_lb.app.dns_name}"
}

output "ecr_repository_url" {
  description = "ECR repository URL to push the app image to."
  value       = aws_ecr_repository.app.repository_url
}

output "github_actions_role_arn" {
  description = "Role ARN for the GitHub Actions OIDC workflow (role-to-assume)."
  value       = aws_iam_role.github_actions.arn
}
