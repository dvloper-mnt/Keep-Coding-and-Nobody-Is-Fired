data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# ECR — private repository for the app image
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "app" {
  name                 = var.service_name
  image_tag_mutability = "MUTABLE"
  force_delete         = true

  image_scanning_configuration {
    scan_on_push = true
  }
}

# ---------------------------------------------------------------------------
# IAM — task execution role (pull from ECR, push logs to CloudWatch)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${var.service_name}-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

resource "aws_iam_role_policy_attachment" "execution_managed" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# ---------------------------------------------------------------------------
# IAM — infrastructure role (ECS Express manages ALB, target groups, scaling)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_infra_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "infrastructure" {
  name               = "${var.service_name}-infrastructure"
  assume_role_policy = data.aws_iam_policy_document.ecs_infra_assume.json
}

resource "aws_iam_role_policy_attachment" "infrastructure_managed" {
  role = aws_iam_role.infrastructure.name
  # Managed policy for ECS Express Mode infrastructure management.
  # Verify the exact ARN against the AWS docs for your account/region before apply.
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSInfrastructureRolePolicyForExpressGatewayServices"
}

# ---------------------------------------------------------------------------
# ECS Express Mode service
# Schema mirrors AWS::ECS::ExpressGatewayService (CloudFormation). The Terraform
# provider (>= 6.23.0) maps these to snake_case. Run `terraform validate` to
# confirm exact nested-block names before apply.
# ---------------------------------------------------------------------------

resource "aws_ecs_express_gateway_service" "app" {
  execution_role_arn      = aws_iam_role.execution.arn
  infrastructure_role_arn = aws_iam_role.infrastructure.arn

  primary_container {
    image = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"

    environment {
      name  = "KV_REST_API_URL"
      value = var.kv_rest_api_url
    }
    environment {
      name  = "KV_REST_API_TOKEN"
      value = var.kv_rest_api_token
    }
    environment {
      name  = "AWS_REGION"
      value = var.aws_region
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.execution_managed,
    aws_iam_role_policy_attachment.infrastructure_managed,
  ]
}
