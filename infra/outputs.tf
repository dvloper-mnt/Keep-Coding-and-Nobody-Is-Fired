output "service_endpoints" {
  description = "Public HTTPS endpoint(s) of the ECS Express service."
  value       = [for p in aws_ecs_express_gateway_service.app.ingress_paths : p.endpoint]
}

output "service_arn" {
  description = "ARN of the ECS Express service."
  value       = aws_ecs_express_gateway_service.app.service_arn
}

output "ecr_repository_url" {
  description = "ECR repository URL to push the app image to."
  value       = aws_ecr_repository.app.repository_url
}

output "github_actions_role_arn" {
  description = "Role ARN for the GitHub Actions OIDC workflow (role-to-assume)."
  value       = aws_iam_role.github_actions.arn
}
