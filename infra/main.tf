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

# Task role: what the running app may do — invoke Claude on Bedrock to generate
# challenges at runtime. Bedrock authenticates via this role, not an env var.
resource "aws_iam_role" "task" {
  name               = "${var.service_name}-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}

data "aws_iam_policy_document" "bedrock" {
  statement {
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
      "bedrock:Converse",
      "bedrock:ConverseStream",
    ]
    resources = [
      "arn:aws:bedrock:*::foundation-model/anthropic.*",
      "arn:aws:bedrock:*:*:inference-profile/*anthropic.*",
    ]
  }

  # Apply the content guardrail on generation.
  statement {
    actions   = ["bedrock:ApplyGuardrail"]
    resources = [aws_bedrock_guardrail.main.guardrail_arn]
  }
}

resource "aws_iam_role_policy" "bedrock" {
  name   = "${var.service_name}-bedrock-invoke"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.bedrock.json
}

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/ecs/${var.service_name}"
  retention_in_days = 7
}

# ---------------------------------------------------------------------------
# ECS Fargate: cluster + task definition + ALB + service.
# Classic Fargate (not Express) because the task needs assign_public_ip=true to
# reach ECR from public subnets without a NAT gateway — Express does not expose
# that control, which left tasks unable to pull the image.
# ---------------------------------------------------------------------------

resource "aws_ecs_cluster" "main" {
  name = "${var.service_name}-cluster"
}

resource "aws_ecs_task_definition" "app" {
  family                   = var.service_name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name         = "app"
      image        = "${aws_ecr_repository.app.repository_url}:${var.image_tag}"
      essential    = true
      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
      environment = [
        { name = "REDIS_HOST", value = aws_elasticache_replication_group.sessions.primary_endpoint_address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "NODE_ENV", value = "production" },
        { name = "BEDROCK_RUNTIME_TIMEOUT_MS", value = tostring(var.bedrock_timeout_ms) },
        { name = "BEDROCK_GUARDRAIL_ID", value = aws_bedrock_guardrail.main.guardrail_id },
        { name = "BEDROCK_GUARDRAIL_VERSION", value = aws_bedrock_guardrail_version.main.version },
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.app.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "app"
        }
      }
    }
  ])
}

resource "aws_lb" "app" {
  name               = "${var.service_name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.private[*].id

  # Quién pega y a qué ruta — lo que las métricas de CloudWatch no dicen.
  # Definido en access-logs.tf.
  access_logs {
    bucket  = aws_s3_bucket.alb_logs.id
    enabled = true
  }

  # Referenciar el bucket solo crea dependencia con el bucket, no con su policy.
  # ELB valida s3:PutObject al habilitar el logging, así que sin esto un apply
  # desde cero puede intentar habilitarlo antes de que la policy exista y
  # fallar con access denied.
  depends_on = [aws_s3_bucket_policy.alb_logs]
}

resource "aws_lb_target_group" "app" {
  name        = "${var.service_name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    path                = "/"
    healthy_threshold   = 2
    unhealthy_threshold = 5
    timeout             = 10
    interval            = 30
    matcher             = "200"
  }
}

resource "aws_lb_listener" "app" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_ecs_service" "app" {
  name            = var.service_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.app.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  # Deployment explícito: garantiza rolling update sin downtime durante
  # los reemplazos de task (deploys propios y retiros de plataforma de Fargate).
  # min 100% = nunca baja de la capacidad deseada; max 200% = levanta la
  # task nueva y la deja sana ANTES de drenar la vieja.
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  # Rollback automático si el deploy falla los health checks del target group.
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.app.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  depends_on = [aws_lb_listener.app]
}
