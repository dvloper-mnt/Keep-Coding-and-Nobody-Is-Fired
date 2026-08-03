# ---------------------------------------------------------------------------
# ALB access logs — el detalle que CloudWatch no da.
#
# Las métricas del ALB (RequestCount, HTTPCode_*) dicen CUÁNTO tráfico hay,
# pero no QUIÉN lo genera ni A QUÉ ruta pega. Sin esto, un 68% de 4XX es un
# número sin explicación. Con esto, se puede separar tráfico humano del ruido
# de bots que escanean el endpoint público.
#
# Consultar con Athena — ver docs/observabilidad.md.
# ---------------------------------------------------------------------------

# La cuenta de AWS que escribe los logs varía por región. En us-east-1 es
# 127311923021. El data source la resuelve sola: nada de hardcodear.
data "aws_elb_service_account" "main" {}

resource "aws_s3_bucket" "alb_logs" {
  bucket        = "${var.service_name}-alb-logs-${data.aws_caller_identity.current.account_id}"
  force_destroy = true
}

# Los access logs no son públicos: contienen IPs de clientes.
resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    apply_server_side_encryption_by_default {
      # El ALB solo sabe escribir con SSE-S3 (AES256). Con KMS falla en
      # silencio: el atributo queda activo pero no aparece ni un objeto.
      sse_algorithm = "AES256"
    }
  }
}

# Sin esto el bucket crece para siempre. Con ~2.750 req/día y buena parte
# siendo bots, el volumen sube rápido y el costo no baja nunca.
resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id

  rule {
    id     = "expire-access-logs"
    status = "Enabled"

    filter {}

    expiration {
      days = var.alb_logs_retention_days
    }

    # Los multipart abortados no se borran solos y siguen cobrando.
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# El ALB escribe como la cuenta de servicio de ELB de la región, NO con un
# principal de servicio. Es la única forma que funciona en us-east-1.
data "aws_iam_policy_document" "alb_logs" {
  statement {
    sid    = "AllowELBAccountWrite"
    effect = "Allow"

    principals {
      type        = "AWS"
      identifiers = [data.aws_elb_service_account.main.arn]
    }

    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.alb_logs.arn}/*"]
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = data.aws_iam_policy_document.alb_logs.json
}

output "alb_logs_bucket" {
  description = "Bucket S3 con los access logs del ALB."
  value       = aws_s3_bucket.alb_logs.id
}
