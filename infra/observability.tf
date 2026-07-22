# ---------------------------------------------------------------------------
# CloudWatch dashboard — operational view of the game in production.
# Open it at: AWS Console → CloudWatch → Dashboards → keep-coding-game.
# Uses metrics AWS already collects (ALB, Fargate, Bedrock) — no app changes.
# ---------------------------------------------------------------------------

locals {
  alb_suffix = replace(aws_lb.app.arn, "/^.*?(app/.+)$/", "$1")
  tg_suffix  = replace(aws_lb_target_group.app.arn, "/^.*?(targetgroup/.+)$/", "$1")
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = var.service_name

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "text", x = 0, y = 0, width = 24, height = 2,
        properties = {
          markdown = "# Keep Coding and Nobody Is Fired — producción (${var.aws_region})\nVista operativa: tráfico, cómputo y la IA (Bedrock). El relato del incidente en datos."
        }
      },

      # --- Bedrock: el corazón del juego (generación con IA) ---
      {
        type = "metric", x = 0, y = 2, width = 12, height = 6,
        properties = {
          title  = "Bedrock — invocaciones",
          region = var.aws_region,
          view   = "timeSeries", stacked = false,
          metrics = [
            ["AWS/Bedrock", "Invocations", "ModelId", var.bedrock_model_id, { stat = "Sum", label = "Invocaciones" }],
            ["AWS/Bedrock", "InvocationClientErrors", "ModelId", var.bedrock_model_id, { stat = "Sum", label = "Errores cliente" }],
            ["AWS/Bedrock", "InvocationServerErrors", "ModelId", var.bedrock_model_id, { stat = "Sum", label = "Errores servidor" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 2, width = 12, height = 6,
        properties = {
          title  = "Bedrock — latencia (ms)",
          region = var.aws_region,
          view   = "timeSeries",
          metrics = [
            ["AWS/Bedrock", "InvocationLatency", "ModelId", var.bedrock_model_id, { stat = "Average", label = "Promedio" }],
            ["AWS/Bedrock", "InvocationLatency", "ModelId", var.bedrock_model_id, { stat = "p99", label = "p99" }]
          ]
        }
      },

      # --- Bedrock: tokens consumidos (la base del costo) ---
      {
        type = "metric", x = 0, y = 8, width = 12, height = 6,
        properties = {
          title  = "Bedrock — tokens consumidos",
          region = var.aws_region,
          view   = "timeSeries", stacked = true,
          metrics = [
            ["AWS/Bedrock", "InputTokenCount", "ModelId", var.bedrock_model_id, { stat = "Sum", label = "Input" }],
            ["AWS/Bedrock", "OutputTokenCount", "ModelId", var.bedrock_model_id, { stat = "Sum", label = "Output" }]
          ]
        }
      },

      # --- Bedrock: costo estimado (tokens × precio Haiku 4.5) ---
      # Precios us-east-1 (USD/1M tokens): input ~$1, output ~$5.
      # metric math: (input/1e6)*input_price + (output/1e6)*output_price.
      {
        type = "metric", x = 12, y = 8, width = 12, height = 6,
        properties = {
          title  = "Bedrock — costo estimado (USD)",
          region = var.aws_region,
          view   = "timeSeries",
          metrics = [
            ["AWS/Bedrock", "InputTokenCount", "ModelId", var.bedrock_model_id, { stat = "Sum", id = "in", visible = false }],
            ["AWS/Bedrock", "OutputTokenCount", "ModelId", var.bedrock_model_id, { stat = "Sum", id = "out", visible = false }],
            [{ expression = "(in/1000000)*${var.bedrock_input_price_per_1m} + (out/1000000)*${var.bedrock_output_price_per_1m}", label = "USD estimado por período", id = "cost" }]
          ]
        }
      },

      # --- ALB: tráfico y salud ---
      {
        type = "metric", x = 0, y = 14, width = 12, height = 6,
        properties = {
          title  = "ALB — requests y códigos",
          region = var.aws_region,
          view   = "timeSeries", stacked = false,
          metrics = [
            ["AWS/ApplicationELB", "RequestCount", "LoadBalancer", local.alb_suffix, { stat = "Sum", label = "Requests" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", local.alb_suffix, { stat = "Sum", label = "5XX" }],
            ["AWS/ApplicationELB", "HTTPCode_Target_4XX_Count", "LoadBalancer", local.alb_suffix, { stat = "Sum", label = "4XX" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 14, width = 12, height = 6,
        properties = {
          title  = "ALB — latencia de respuesta (s)",
          region = var.aws_region,
          view   = "timeSeries",
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_suffix, { stat = "Average", label = "Promedio" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_suffix, { stat = "p99", label = "p99" }]
          ]
        }
      },

      # --- Fargate: cómputo ---
      {
        type = "metric", x = 0, y = 20, width = 12, height = 6,
        properties = {
          title  = "Fargate — CPU / memoria (%)",
          region = var.aws_region,
          view   = "timeSeries",
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.app.name, { stat = "Average", label = "CPU %" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", aws_ecs_service.app.name, { stat = "Average", label = "Memoria %" }]
          ]
        }
      },
      {
        type = "metric", x = 12, y = 20, width = 12, height = 6,
        properties = {
          title  = "ALB — hosts saludables",
          region = var.aws_region,
          view   = "timeSeries",
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "LoadBalancer", local.alb_suffix, "TargetGroup", local.tg_suffix, { stat = "Average", label = "Saludables" }],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "LoadBalancer", local.alb_suffix, "TargetGroup", local.tg_suffix, { stat = "Average", label = "No saludables" }]
          ]
        }
      }
    ]
  })
}

output "dashboard_url" {
  description = "URL del dashboard de CloudWatch."
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards/dashboard/${var.service_name}"
}
