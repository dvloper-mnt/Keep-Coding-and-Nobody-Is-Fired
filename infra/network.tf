# ---------------------------------------------------------------------------
# VPC for the ECS Express service + ElastiCache. ElastiCache has no public
# endpoint, so the app and the cache must share a private network.
# ---------------------------------------------------------------------------

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${var.service_name}-vpc" }
}

# Two private subnets in different AZs (ECS/ALB and ElastiCache want >= 2 AZs).
resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = { Name = "${var.service_name}-private-${count.index}" }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# ---------------------------------------------------------------------------
# Security groups: the ECS tasks may reach Redis on 6379; nothing else can.
# ---------------------------------------------------------------------------

resource "aws_security_group" "ecs" {
  name        = "${var.service_name}-ecs"
  description = "ECS Express service tasks"
  vpc_id      = aws_vpc.main.id

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name        = "${var.service_name}-redis"
  description = "ElastiCache Redis reachable only from the ECS tasks"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Redis from ECS tasks"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }
}
