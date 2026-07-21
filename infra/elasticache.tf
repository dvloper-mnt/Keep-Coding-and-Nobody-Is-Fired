# ---------------------------------------------------------------------------
# ElastiCache (Redis) — session store, replacing Upstash/@vercel/kv.
# Single-node, no public access; only the ECS security group can reach 6379.
# ---------------------------------------------------------------------------

resource "aws_elasticache_subnet_group" "main" {
  name       = "${var.service_name}-cache"
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_elasticache_replication_group" "sessions" {
  replication_group_id = "${var.service_name}-sessions"
  description          = "Redis session store for ${var.service_name}"

  engine             = "redis"
  node_type          = "cache.t4g.micro"
  num_cache_clusters = 1
  port               = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  # MVP: no TLS/auth token to keep the client simple (private subnet only).
  # For production hardening, enable transit_encryption_enabled + auth_token
  # and set REDIS_PASSWORD on the service.
  transit_encryption_enabled = false

  tags = { Name = "${var.service_name}-sessions" }
}
