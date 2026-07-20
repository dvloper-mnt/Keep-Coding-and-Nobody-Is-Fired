# Tasks — AWS Deploy con Terraform (ECS Express Mode) + CI/CD

> ⚠️ Antes de escribir cualquier HCL: leer la doc del recurso `aws_ecs_express_gateway_service` en el Terraform Registry para la versión del provider que `terraform init` resuelva (>= 6.23.0). NO copiar HCL de memoria — los nombres de argumentos pueden cambiar entre releases.

- [ ] 1. Containerizar la app (Next.js standalone)
  - [ ] 1.1 Agregar `output: 'standalone'` a `next.config.ts`
    - _Requirements: 1.1_
  - [ ] 1.2 Crear `Dockerfile` multi-stage (deps → build → runner) basado en la salida standalone; runner con `HOSTNAME=0.0.0.0`, `PORT=3000`, `CMD ["node","server.js"]`
    - _Requirements: 1.2, 1.4_
  - [ ] 1.3 Crear `.dockerignore` excluyendo `node_modules`, `.next/cache`, `.git`, `.kiro`, `infra`, `*.tfstate*`, `.env*`
    - _Requirements: 1.3_
  - [ ] 1.4 Verificar localmente: `docker build` + `docker run -p 3000:3000` arranca la app. (El `prebuild`/Bedrock cae a fallback si no hay credenciales en el build — OK)
    - _Requirements: 1.4, 1.5_

- [ ] 2. Infraestructura Terraform — base
  - [ ] 2.1 Crear `infra/versions.tf` fijando `terraform >= 1.15` y provider `hashicorp/aws >= 6.23.0` (mínimo donde existe el recurso express gateway)
    - _Requirements: 2.1, 2.2_
  - [ ] 2.2 Crear `infra/variables.tf` (`aws_region` default us-east-1, `kv_rest_api_url` y `kv_rest_api_token` ambos `sensitive = true`, `service_name`, `image_tag`)
    - _Requirements: 2.3, 3.1_
  - [ ] 2.3 Crear `infra/.gitignore` para `*.tfstate`, `*.tfstate.*`, `.terraform/`, `*.tfvars`
    - _Requirements: 2.9, 3.1_

- [ ] 3. Infraestructura Terraform — recursos
  - [ ] 3.1 ECR: `aws_ecr_repository` privado para la imagen de la app
    - _Requirements: 2.4_
  - [ ] 3.2 IAM: task execution role (principal `ecs-tasks.amazonaws.com` + `AmazonECSTaskExecutionRolePolicy`) e infrastructure role (confirmar la policy administrada de express gateway en la doc al implementar)
    - _Requirements: 2.5_
  - [ ] 3.3 `aws_ecs_express_gateway_service`: contenedor primario apuntando a la imagen ECR, `execution_role_arn`, `infrastructure_role_arn`, puerto 3000, y runtime env vars (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, `AWS_REGION`) desde variables sensitive
    - _Requirements: 2.6, 2.7, 6.1_
  - [ ] 3.4 `infra/outputs.tf`: URL pública del servicio y URL del repo ECR
    - _Requirements: 2.8_

- [ ] 4. IAM para CI/CD (OIDC)
  - [ ] 4.1 En Terraform: OIDC provider de GitHub (`token.actions.githubusercontent.com`) y un rol IAM con trust policy a `repo:MoisesCorcho/Hackacthon:*`, con permisos mínimos (ECR push, describe/update del servicio ECS Express, sts)
    - _Requirements: 4.2, 4.6_

- [ ] 5. GitHub Actions (deploy al push)
  - [ ] 5.1 Crear `.github/workflows/deploy.yml` con trigger `push` a `main` y `permissions: { id-token: write, contents: read }`
    - _Requirements: 4.1, 4.2_
  - [ ] 5.2 Steps en orden: checkout → `npm ci` → `npm run lint && npm run test` (aborta si falla) → generar `questions.json` con Bedrock (credenciales OIDC ya presentes) → `configure-aws-credentials` (OIDC) → `amazon-ecr-login` → `docker build` + push con tag `${{ github.sha }}` y `latest`
    - _Requirements: 4.3, 4.5_
  - [ ] 5.3 Step de redeploy del servicio ECS Express Mode con la imagen nueva (confirmar el comando exacto para express mode al implementar)
    - _Requirements: 4.4_

- [ ] 6. Husky (calidad local)
  - [ ] 6.1 Instalar Husky, script `prepare`, y hook `pre-push` que corra `npm run lint` y `npm run test`. Confirmar que NO dispara ningún deploy
    - _Requirements: 5.1, 5.2, 5.3_

- [ ] 7. Deploy y verificación
  - [ ] 7.1 `terraform init` + `plan` + `apply` (con `.tfvars` de KV gitignored). Confirmar que crea ECR, roles, OIDC y el servicio sin errores de versión de provider
    - _Requirements: 2.1, 2.2_
  - [ ] 7.2 Build+push de la primera imagen y redeploy; abrir la URL pública del output y confirmar que la app carga
    - _Requirements: 2.8, 6.1_
  - [ ] 7.3 SMOKE TEST del bug CRITICAL: abrir `/coder` en un dispositivo/navegador, tomar el room code, abrir `/helper` en OTRO y unirse. Confirmar que la sync funciona (la sesión cruza tasks porque vive en Upstash, no en memoria)
    - _Requirements: 6.2, 6.3_
  - [ ] 7.4 Probar el push→deploy: hacer un push trivial a main y confirmar que Actions corre lint/test, construye, publica y redespliega sin intervención manual
    - _Requirements: 4.1, 4.3, 4.4_

- [ ] 8. Gate de seguridad (antes de declarar terminado)
  - [ ] 8.1 Confirmar: cero secretos en archivos commiteados (`.tf`, Dockerfile, workflow); `terraform.tfstate` gitignored; Actions usa SOLO OIDC (sin access keys en Secrets); env vars KV seteadas en el servicio (USE_KV=true, no cae a memoria)
    - _Requirements: 3.1, 3.2, 4.2, 6.1_
