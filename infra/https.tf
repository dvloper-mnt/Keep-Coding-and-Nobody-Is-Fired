# ---------------------------------------------------------------------------
# HTTPS on the custom domain. The domain lives in Hostinger (not Route53), so
# the ACM validation record is created in Hostinger via MCP, not by Terraform.
# Terraform emits the cert and the records to add; once validated, the 443
# listener serves the app over HTTPS and HTTP redirects to it.
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "app" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# HTTPS listener — added once the certificate is ISSUED.
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.app.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
