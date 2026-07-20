# Design — AWS Deploy con Terraform (ECS Express Mode) + CI/CD

## Overview

Containerizar Next.js (standalone) → publicar la imagen en ECR → provisionar un `aws_ecs_express_gateway_service` con Terraform → automatizar build+deploy con GitHub Actions (OIDC) → Husky para calidad local. Upstash Redis se mantiene como store de sesiones (externo, sin VPC).

## Arquitectura

```
   DEV                       GITHUB                          AWS
┌─────────┐   git push   ┌──────────────────┐          ┌──────────────────────────────┐
│ Husky   │─────────────▶│ Actions deploy.yml│          │  ECR (imagen)                 │
│pre-push:│              │ 1. lint + test    │  OIDC    │     ▲ push                    │
│lint+test│              │ 2. OIDC → AWS     │─────────▶│     │                         │
└─────────┘              │ 3. build + push   │          │  ECS Express Mode             │
                         │ 4. redeploy ECS   │          │   (Fargate + ALB HTTPS + URL) │
                         └──────────────────┘          │     │ runtime env vars          │
                                                        └─────┼─────────────────────────┘
                                                              ▼
                                                     Upstash Redis (sesiones, externo)
```

## Por qué ECS Express Mode (sucesor de App Runner)

App Runner no acepta clientes nuevos desde abril/2026. ECS Express Mode es el reemplazo oficial de AWS: un único recurso que, a partir de una imagen + dos roles IAM, levanta Fargate + ALB con HTTPS + autoscaling + CloudWatch + URL pública. Mismo espíritu "low-config" que App Runner, pero vigente. Sin costo adicional del servicio (se paga la infra subyacente).

## Decisiones técnicas

### Recurso y versión de provider (CRÍTICO)

```hcl
# versions.tf
terraform {
  required_version = ">= 1.15"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.23.0"   # aws_ecs_express_gateway_service existe desde 6.23.0
    }
  }
}
```

> **Verificar antes de escribir el `main.tf`:** leer la doc del recurso `aws_ecs_express_gateway_service` en la versión del provider que `terraform init` resuelva (Registry de Terraform). Los nombres exactos de los argumentos (`primary_container`, `execution_role_arn`, `infrastructure_role_arn`, puerto) pueden ajustarse entre releases. NO copiar HCL de memoria — confirmar contra el Registry.

### Los dos roles IAM que el servicio requiere

1. **Task execution role** — principal `ecs-tasks.amazonaws.com`, con `AmazonECSTaskExecutionRolePolicy` (pull de ECR + logs a CloudWatch).
2. **Infrastructure role** — el principal y la policy administrada que ECS Express Mode pide para gestionar la infra subyacente (ALB, scaling). Confirmar el nombre exacto de la policy administrada en la doc al implementar.

### Dockerfile (Next standalone, multi-stage)

```dockerfile
# deps
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# build (corre prebuild → genera preguntas con Bedrock o cae a fallback)
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# runner (imagen mínima desde standalone)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

> Nota: el `prebuild` con Bedrock en build de Docker requiere credenciales AWS en el contexto de build (build-arg/secret), o se acepta que en la imagen caiga al fallback curado. Para el MVP, lo más simple: generar las preguntas en el job de Actions ANTES del `docker build` (donde ya hay credenciales OIDC), commitear/pasar el `questions.json` resultante al contexto. Documentar la elección.

### GitHub Actions con OIDC (sin llaves persistentes)

```yaml
# .github/workflows/deploy.yml (esqueleto)
on: { push: { branches: [main] } }
permissions: { id-token: write, contents: read }
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run lint && npm run test     # aborta si falla (R4.5)
      - uses: aws-actions/configure-aws-credentials@v4
        with: { role-to-assume: <ARN del rol OIDC>, aws-region: us-east-1 }
      - uses: aws-actions/amazon-ecr-login@v2
      - run: |                                # build + push con tag = SHA y latest
          docker build -t $ECR_URI:${{ github.sha }} -t $ECR_URI:latest .
          docker push $ECR_URI:${{ github.sha }}
          docker push $ECR_URI:latest
      - run: aws ecs update-service ... --force-new-deployment   # redeploy
```

> Confirmar el comando exacto de redeploy para ECS Express Mode al implementar (puede diferir de un `update-service` clásico). El OIDC provider de GitHub en IAM y el rol con trust policy a `repo:MoisesCorcho/Hackacthon:*` los crea Terraform.

### Reparto de herramientas (la regla de oro)

| Herramienta | Dónde corre | Rol |
|-------------|-------------|-----|
| Husky | máquina del dev | lint + test ANTES del push. NO despliega. |
| GitHub Actions | nube | build + push + deploy DESPUÉS del push. |
| Terraform | dev/CI | provisiona ECR, roles IAM, OIDC provider, el servicio. |
| Upstash | externo | sesiones (sin tocar). |

## Manejo de secretos

- `KV_REST_API_URL` / `KV_REST_API_TOKEN`: variables Terraform `sensitive = true`, vía `.tfvars` gitignored o `TF_VAR_*`. Inyectadas al contenedor como runtime env (o, mejor, vía SSM/Secrets Manager si alcanza el tiempo).
- `terraform.tfstate`: gitignored siempre (contiene secretos en texto plano). Para la hackathon, state local es aceptable; documentar que un backend S3+DynamoDB sería lo correcto en producción.
- AWS creds en Actions: SOLO OIDC. Cero access keys en Secrets.

## Riesgos y mitigaciones

- **Riesgo:** `aws_ecs_express_gateway_service` es nuevo; argumentos pueden cambiar. **Mitigación:** fijar `>= 6.23.0` y leer el Registry al escribir el HCL; no asumir.
- **Riesgo:** el bug CRITICAL de la auditoría (fallback a memoria) si faltan las env vars KV en el contenedor. **Mitigación:** R6 obliga a setear `KV_REST_API_*`; el smoke test post-deploy lo verifica con dos requests cruzadas. Idealmente, aplicar primero el fix de fail-fast (spec aparte) para que el contenedor explote ruidosamente si falta KV, en vez de degradar en silencio.
- **Riesgo:** secretos en el state plano. **Mitigación:** gitignore del state + variables sensitive + (si hay tiempo) backend remoto.
- **Riesgo:** Bedrock en el build de Docker sin credenciales. **Mitigación:** generar el `questions.json` en el job de Actions antes del `docker build`; la imagen solo copia el JSON ya resuelto.

## Out of scope

ElastiCache, VPC custom, dominios/ACM custom, multi-ambiente, backend remoto de state. Solo el camino más corto a "corre en AWS con Terraform + deploy al push".
