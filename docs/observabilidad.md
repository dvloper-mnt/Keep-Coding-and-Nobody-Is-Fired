# Observabilidad

Dos fuentes de datos, dos preguntas distintas.

| Fuente | Responde | Dónde |
|---|---|---|
| Dashboard CloudWatch | ¿Cuánto tráfico? ¿Cuánto cuesta la IA? | [Consola](https://us-east-1.console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards/dashboard/keep-coding-game) |
| ALB access logs (S3) | ¿Quién pega y a qué ruta? | `s3://keep-coding-game-alb-logs-348351095319` |

## Por qué existen los access logs

Las métricas del ALB dicen *cuántos* requests hay, no *quién* los hace. Medido
entre el 24-jun y el 3-ago-2026, el **68 % del tráfico fueron respuestas 4XX**
(76.893 de 112.575). Los logs de ECS apuntan a escaneo automatizado contra el
endpoint de Next.js Server Actions:

```
Error: The Server Reference ID did not match the expected format. Received "x".
```

Ningún cliente legítimo manda `"x"` como Server Reference ID. Pero `RequestCount`
no distingue un bot de una persona, así que el número de "uso" quedaba inflado.

Contraste con el mismo período: **253 invocaciones a Bedrock**. Cada partida real
genera challenges con IA, así que ese es el proxy honesto de uso — y es tres
órdenes de magnitud menor que el conteo bruto de requests.

Los access logs cierran ese hueco: traen IP de origen, user-agent, ruta y código
de respuesta por cada request.

> Configurado en [`infra/access-logs.tf`](../infra/access-logs.tf). Retención:
> **30 días** (`var.alb_logs_retention_days`), con expiración automática para que
> el bucket no crezca indefinidamente.

## Consultar con Athena

Los logs son `.gz` particionados por fecha en S3. Athena los lee con SQL.

### 1. Crear la tabla

Una sola vez. En la consola de Athena, región `us-east-1`:

Una columna por grupo de captura del regex — son **33**, en este orden exacto.
`RegexSerDe` asigna por posición, así que si el conteo no coincide los valores
se corren en silencio y las consultas devuelven datos equivocados sin fallar.

```sql
CREATE EXTERNAL TABLE IF NOT EXISTS alb_logs (
  type string,
  time string,
  elb string,
  client_ip string,
  client_port int,
  target_ip string,
  target_port int,
  request_processing_time double,
  target_processing_time double,
  response_processing_time double,
  elb_status_code string,
  target_status_code string,
  received_bytes bigint,
  sent_bytes bigint,
  request_verb string,
  request_url string,
  request_proto string,
  user_agent string,
  ssl_cipher string,
  ssl_protocol string,
  target_group_arn string,
  trace_id string,
  domain_name string,
  chosen_cert_arn string,
  matched_rule_priority string,
  request_creation_time string,
  actions_executed string,
  redirect_url string,
  lambda_error_reason string,
  target_port_list string,
  target_status_code_list string,
  classification string,
  classification_reason string
)
ROW FORMAT SERDE 'org.apache.hadoop.hive.serde2.RegexSerDe'
WITH SERDEPROPERTIES (
  'serialization.format' = '1',
  'input.regex' =
  '([^ ]*) ([^ ]*) ([^ ]*) ([^ ]*):([0-9]*) ([^ ]*)[:-]([0-9]*) ([-.0-9]*) ([-.0-9]*) ([-.0-9]*) (|[-0-9]*) (-|[-0-9]*) ([-0-9]*) ([-0-9]*) \"([^ ]*) (.*) (- |[^ ]*)\" \"([^\"]*)\" ([A-Z0-9-_]+) ([A-Za-z0-9.-]*) ([^ ]*) \"([^\"]*)\" \"([^\"]*)\" \"([^\"]*)\" ([-.0-9]*) ([^ ]*) \"([^\"]*)\" \"([^\"]*)\" \"([^ ]*)\" \"([^\\s]+?)\" \"([^\\s]+)\" \"([^ ]*)\" \"([^ ]*)\"'
)
LOCATION 's3://keep-coding-game-alb-logs-348351095319/AWSLogs/348351095319/elasticloadbalancing/us-east-1/';
```

> El regex parte `ip:puerto` en dos columnas (`client_ip` / `client_port`, y el
> par equivalente del target) y la línea de request en tres (`request_verb`,
> `request_url`, `request_proto`). Es el esquema oficial de AWS — no lo edites a
> mano ni colapses columnas.
>
> `elb_status_code` se declara `string`, no `int`: cuando el ALB no llega a
> obtener respuesta del target escribe `-`. Por eso las consultas de abajo
> castean con `try_cast`, que devuelve `NULL` en vez de reventar la query.

### 2. Separar bots de humanos

**Top user-agents** — los bots se delatan solos:

```sql
SELECT user_agent, count(*) AS hits
FROM alb_logs
GROUP BY user_agent
ORDER BY hits DESC
LIMIT 20;
```

**Rutas que generan 4XX** — dónde está el ruido:

```sql
SELECT
  regexp_extract(request_url, '^https?://[^/]+(/[^?]*)', 1) AS ruta,
  elb_status_code,
  count(*) AS hits
FROM alb_logs
WHERE try_cast(elb_status_code AS integer) >= 400
GROUP BY 1, 2
ORDER BY hits DESC
LIMIT 30;
```

**IPs más agresivas** — candidatas a bloquear en el WAF:

```sql
SELECT client_ip, count(*) AS hits,
       count_if(try_cast(elb_status_code AS integer) >= 400) AS errores
FROM alb_logs
GROUP BY 1
ORDER BY hits DESC
LIMIT 20;
```

**Requests a la IP cruda del ALB** — nadie que quiera jugar escribe la IP del
load balancer; esto es escaneo de rangos de AWS:

```sql
SELECT client_ip, user_agent, count(*) AS hits
FROM alb_logs
WHERE regexp_like(request_url, '^https?://\d+\.\d+\.\d+\.\d+')
GROUP BY 1, 2
ORDER BY hits DESC
LIMIT 20;
```

**Tráfico plausiblemente humano** — descarta agentes conocidos de bot:

```sql
SELECT date(from_iso8601_timestamp(time)) AS dia,
       count(*) AS requests,
       count(DISTINCT client_ip) AS ips_unicas
FROM alb_logs
WHERE elb_status_code = '200'
  AND lower(user_agent) NOT LIKE '%bot%'
  AND lower(user_agent) NOT LIKE '%crawler%'
  AND lower(user_agent) NOT LIKE '%spider%'
  AND lower(user_agent) NOT LIKE '%curl%'
  AND lower(user_agent) NOT LIKE '%python%'
GROUP BY 1
ORDER BY dia;
```

> Filtrar por user-agent es heurística, no verdad. Un bot puede mentir su UA.
> Para un conteo de uso confiable hace falta una métrica de negocio en la app
> (`GamesStarted` / `GamesCompleted`) — está en el backlog.

## Costos

- **S3**: con 30 días de retención y este volumen, centavos al mes.
- **Athena**: se cobra por bytes escaneados (~5 USD/TB). Estas consultas escanean
  megabytes. Acota por partición de fecha si el volumen crece.
