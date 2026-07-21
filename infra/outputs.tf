output "app_url" {
  description = "Public URL of the app (ALB, HTTP)."
  value       = "http://${aws_lb.app.dns_name}"
}

output "app_url_https" {
  description = "Public HTTPS URL on the custom domain."
  value       = "https://${var.domain_name}"
}

output "alb_dns_name" {
  description = "ALB DNS name — point the custom domain CNAME here."
  value       = aws_lb.app.dns_name
}

output "acm_validation_records" {
  description = "DNS records to create (in Hostinger) to validate the ACM certificate."
  value = [
    for o in aws_acm_certificate.app.domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}

output "ecr_repository_url" {
  description = "ECR repository URL to push the app image to."
  value       = aws_ecr_repository.app.repository_url
}

output "github_actions_role_arn" {
  description = "Role ARN for the GitHub Actions OIDC workflow (role-to-assume)."
  value       = aws_iam_role.github_actions.arn
}
