# ---------------------------------------------------------------------------
# Bedrock Guardrail — responsible AI. The challenge prompt is tightly scoped to
# programming bugs, so the risk of unsafe output is low; this is a belt-and-
# suspenders content filter on everything Bedrock generates for the game.
# Requires AWS provider >= 6.23 (see versions.tf).
# ---------------------------------------------------------------------------

resource "aws_bedrock_guardrail" "main" {
  name                      = "${var.service_name}-guardrail"
  description               = "Content safety for AI-generated debugging challenges."
  blocked_input_messaging   = "Ese contenido no se puede procesar."
  blocked_outputs_messaging = "El incidente generado no pasó el filtro de contenido."

  # Filter the standard harmful-content categories on input and output.
  content_policy_config {
    filters_config {
      type            = "HATE"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "VIOLENCE"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "SEXUAL"
      input_strength  = "HIGH"
      output_strength = "HIGH"
    }
    filters_config {
      type            = "INSULTS"
      input_strength  = "MEDIUM"
      output_strength = "MEDIUM"
    }
    filters_config {
      type            = "MISCONDUCT"
      input_strength  = "MEDIUM"
      output_strength = "MEDIUM"
    }
    filters_config {
      type            = "PROMPT_ATTACK"
      input_strength  = "HIGH"
      output_strength = "NONE" # PROMPT_ATTACK only applies to input.
    }
  }
}

# A published version is what gets applied at runtime (DRAFT can't be invoked).
resource "aws_bedrock_guardrail_version" "main" {
  guardrail_arn = aws_bedrock_guardrail.main.guardrail_arn
  description   = "v1 — content filters"
}

output "guardrail_id" {
  description = "Guardrail identifier to pass to the app (BEDROCK_GUARDRAIL_ID)."
  value       = aws_bedrock_guardrail.main.guardrail_id
}

output "guardrail_version" {
  description = "Published guardrail version to pass to the app (BEDROCK_GUARDRAIL_VERSION)."
  value       = aws_bedrock_guardrail_version.main.version
}
