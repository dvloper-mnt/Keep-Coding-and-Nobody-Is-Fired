terraform {
  required_version = ">= 1.15"

  required_providers {
    aws = {
      source = "hashicorp/aws"
      # aws_ecs_express_gateway_service was added in provider v6.23.0.
      # Older versions do not know the resource and `apply` would fail.
      version = ">= 6.23.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
