# Requirements — AWS Deploy con Terraform (ECS Express Mode) + CI/CD

## Introduction

Desplegar el juego (Next.js 16.2.9) en **Amazon ECS Express Mode**, provisionado con **Terraform** (IaC), con deploy automático al hacer `git push` vía **GitHub Actions**. La persistencia de sesiones se mantiene en **Upstash Redis** (`@vercel/kv`) — NO se migra a ElastiCache.

### ⚠️ Por qué ECS Express Mode y NO App Runner

**App Runner quedó en vía muerta.** Desde el **30 de abril de 2026** no acepta clientes nuevos; AWS recomienda explícitamente **Amazon ECS Express Mode** como reemplazo. Como hoy esa fecha ya pasó, crear un App Runner nuevo probablemente fallaría. Por eso pivoteamos a ECS Express Mode, que es el sucesor oficial: mismo modelo de simplicidad (das una imagen, AWS arma el resto), pero vigente y con futuro.

### Decisiones tomadas (con su porqué)

- **ECS Express Mode** (no Amplify, no EC2, no App Runner): un solo recurso (`aws_ecs_express_gateway_service`) que orquesta un servicio ECS Fargate + ALB con HTTPS + auto-scaling + monitoring + URL pública. Reduce los inputs a tres: imagen, task execution role, infrastructure role. Es "infra AWS real" provisionada con Terraform (cumple el VoBo de IaC) con la menor complejidad vigente. Objetivo declarado: **demostrar uso de AWS**.
- **Upstash se queda**: migrar a ElastiCache obligaría a VPC completa, cambiar el cliente `@vercel/kv` por uno de Redis TCP, y tocar `game-service.ts`. Contradice "lo más simple que funcione". El relato "corre en AWS con Terraform" se cumple igual con Upstash externo.
- **GitHub Actions para el deploy, Husky para pre-push**: el deploy corre en la nube (Actions), NO en la máquina del dev. Husky corre lint/tests LOCALMENTE antes del push (su rol correcto), nunca dispara deploys.
- **OIDC, no access keys**: GitHub Actions se autentica con AWS vía OpenID Connect (tokens efímeros). NO se guardan llaves AWS long-lived en GitHub Secrets.

### ⚠️ Restricción técnica de versión (verificada)

El recurso `aws_ecs_express_gateway_service` se agregó al provider `hashicorp/aws` en la **versión 6.23.0** (issue #45219, PR #45235). El `versions.tf` DEBE fijar el provider AWS a `>= 6.23.0`, o el `terraform apply` fallará con "recurso desconocido".

### Repo / contexto

- Repo: `github.com/MoisesCorcho/Hackacthon`.
- `next.config.ts` está vacío → hay que agregar `output: 'standalone'` para containerizar.
- Terraform v1.15.6 instalado. AWS CLI v2 con perfil `default` (acceso verificado, cuenta 348351095319, us-east-1).

## Glossary

- **ECS Express Mode**: servicio AWS que, desde una imagen de contenedor, arma un stack Fargate + ALB HTTPS + autoscaling + URL pública con configuración mínima.
- **ECR**: registro de imágenes Docker de AWS.
- **OIDC**: federación de identidad para que GitHub Actions asuma un rol IAM sin credenciales persistentes.
- **standalone output**: modo de build de Next que produce un `server.js` autónomo con solo las deps necesarias.
- **Task execution role / Infrastructure role**: los dos roles IAM que ECS Express Mode requiere para correr el contenedor y administrar la infra subyacente.

---

## Requirement 1 — Containerizar la app (Next.js standalone)

**User Story:** Como equipo, quiero una imagen Docker mínima y reproducible de la app, para poder correrla en ECS Express Mode.

### Acceptance Criteria

1. THE SYSTEM SHALL configurar `next.config.ts` con `output: 'standalone'`.
2. THE SYSTEM SHALL incluir un `Dockerfile` multi-stage (deps → build → runner) que produzca una imagen de producción basada en la salida standalone.
3. THE SYSTEM SHALL incluir un `.dockerignore` que excluya `node_modules`, `.next/cache`, `.git`, `.kiro`, archivos de entorno y artefactos locales.
4. WHEN se corre el contenedor THE SYSTEM SHALL arrancar `node server.js` escuchando en el puerto definido por la env `PORT` (default 3000) y `HOSTNAME=0.0.0.0`.
5. THE SYSTEM SHALL ejecutar el `prebuild` (generación de preguntas con Bedrock) o degradar a fallback dentro del build de la imagen, sin romper el build si Bedrock no está disponible (consistente con la spec `bedrock-question-gen`).

## Requirement 2 — Infraestructura con Terraform (ECS Express Mode)

**User Story:** Como responsable de infra, quiero toda la infraestructura declarada en Terraform, para provisionarla de forma reproducible y demostrar IaC.

### Acceptance Criteria

1. THE SYSTEM SHALL definir la infra en un directorio `infra/` con archivos `.tf` separados por responsabilidad (`main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`).
2. THE SYSTEM SHALL fijar en `versions.tf` el provider `hashicorp/aws` a `>= 6.23.0` (mínimo donde existe `aws_ecs_express_gateway_service`) y Terraform `>= 1.15`.
3. THE SYSTEM SHALL declarar el provider `aws` con región parametrizada (variable `aws_region`, default `us-east-1`).
4. THE SYSTEM SHALL crear un repositorio **ECR** privado para la imagen de la app.
5. THE SYSTEM SHALL crear los dos roles IAM que ECS Express Mode requiere: el **task execution role** (con `AmazonECSTaskExecutionRolePolicy`, permite pull de ECR y push de logs) y el **infrastructure role** (con la policy administrada de express gateway services).
6. THE SYSTEM SHALL crear un `aws_ecs_express_gateway_service` con: el contenedor primario apuntando a la imagen de ECR, el `execution_role_arn` y el `infrastructure_role_arn`, y el puerto del contenedor (3000).
7. THE SYSTEM SHALL inyectar las variables de entorno de runtime al contenedor (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `AWS_REGION`) sin hardcodear secretos en el `.tf`.
8. THE SYSTEM SHALL exponer como `output` la URL pública del servicio y la URL del repositorio ECR.
9. THE SYSTEM SHALL mantener el state de Terraform fuera del control de versiones (gitignore) o en un backend remoto; NUNCA commitear `terraform.tfstate` (puede contener secretos).

## Requirement 3 — Manejo de secretos

**User Story:** Como responsable de seguridad, quiero que ningún secreto viva en el repo ni en el state plano, porque es un repo que se comparte.

### Acceptance Criteria

1. THE SYSTEM SHALL pasar `KV_REST_API_URL` y `KV_REST_API_TOKEN` vía variables de Terraform marcadas `sensitive = true`, provistas por `.tfvars` (gitignored) o env `TF_VAR_*`.
2. THE SYSTEM SHALL NO incluir ningún token, llave o credencial en archivos `.tf`, `Dockerfile`, ni workflows commiteados.
3. WHERE se usen secretos en runtime, THE SYSTEM SHALL preferir AWS Secrets Manager / SSM Parameter Store referenciados por el contenedor, sobre valores en texto plano (aceptable degradar a env vars de runtime para el MVP si se documenta el tradeoff).

## Requirement 4 — CI/CD con GitHub Actions (deploy al push)

**User Story:** Como dev, quiero que al hacer push a la rama principal se construya y despliegue automáticamente, para no desplegar a mano.

### Acceptance Criteria

1. THE SYSTEM SHALL incluir un workflow en `.github/workflows/deploy.yml` que se dispare en `push` a la rama principal (`main`).
2. THE SYSTEM SHALL autenticarse contra AWS usando **OIDC** (`aws-actions/configure-aws-credentials` con `role-to-assume`), con `permissions: id-token: write`. NO usar access keys long-lived en Secrets.
3. THE SYSTEM SHALL, en orden: (a) correr lint y tests; (b) hacer login a ECR (`aws-actions/amazon-ecr-login`); (c) build de la imagen Docker; (d) push a ECR con tag del SHA del commit y `latest`.
4. WHEN la imagen se publica THE SYSTEM SHALL forzar el redeploy del servicio ECS Express Mode con la imagen nueva (update del servicio o `force-new-deployment`).
5. WHEN lint o tests fallan THE SYSTEM SHALL abortar el pipeline ANTES de construir o desplegar.
6. THE SYSTEM SHALL documentar el rol IAM y el OIDC provider que el workflow necesita (creados por Terraform o documentados como prerequisito).

## Requirement 5 — Husky (calidad local pre-push)

**User Story:** Como dev, quiero que mis errores se atrapen ANTES de subir, para no romper el pipeline ni el deploy.

### Acceptance Criteria

1. THE SYSTEM SHALL instalar Husky y configurar el hook `pre-push` para correr `npm run lint` y `npm run test`.
2. WHEN el lint o los tests fallan localmente THE SYSTEM SHALL bloquear el `git push`.
3. THE SYSTEM SHALL NO disparar deploys desde Husky — el deploy es responsabilidad exclusiva de GitHub Actions.

## Requirement 6 — Persistencia y el bug CRITICAL

**User Story:** Como presentador, quiero que la sync Coder/Helper funcione en ECS Express Mode, porque el hallazgo CRITICAL de la auditoría era justo sobre esto.

### Acceptance Criteria

1. THE SYSTEM SHALL configurar `KV_REST_API_URL` y `KV_REST_API_TOKEN` en el entorno del contenedor, de modo que `USE_KV` sea `true` y NO se caiga al `Map` en memoria.
2. THE SYSTEM SHALL incluir un paso de verificación post-deploy (smoke test) que confirme que una sesión creada en una request es legible en otra (sync cruza instancias/tasks).
3. WHERE ECS Express Mode escale a más de una task, THE SYSTEM SHALL seguir funcionando porque el estado vive en Upstash (externo), no en memoria de instancia.

## Out of scope

- Migración a ElastiCache (descartada).
- VPC custom, dominios propios, certificados ACM custom (ECS Express Mode da HTTPS por defecto).
- Multi-ambiente (staging/prod). Solo un ambiente para la hackathon.
- Backend remoto de Terraform state en S3+DynamoDB (opcional; para MVP, state local gitignored es aceptable si se documenta).
