# ---------------------------------------------------------------------------
# Local-dev IAM user for teammates to invoke Bedrock from their machine.
# Least-privilege: ONLY Bedrock invoke/converse on Anthropic models — nothing
# else (no ECS, no ECR, no infra). The access key is created manually in the
# console (not in Terraform state) and dropped in each dev's .env.local.
#
# Remove this file after the hackathon: `terraform destroy -target=...` or delete
# the user in the console. It exists only so devs can run the game locally with
# real Bedrock generation.
# ---------------------------------------------------------------------------

resource "aws_iam_user" "bedrock_dev" {
  name = "${var.service_name}-bedrock-dev"
  tags = { Purpose = "local-dev-bedrock" }
}

data "aws_iam_policy_document" "bedrock_dev" {
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
}

resource "aws_iam_user_policy" "bedrock_dev" {
  name   = "${var.service_name}-bedrock-dev-invoke"
  user   = aws_iam_user.bedrock_dev.name
  policy = data.aws_iam_policy_document.bedrock_dev.json
}

output "bedrock_dev_user_name" {
  description = "IAM user for local dev. Create an access key for it in the console (IAM → Users → this user → Security credentials), then put it in .env.local."
  value       = aws_iam_user.bedrock_dev.name
}
