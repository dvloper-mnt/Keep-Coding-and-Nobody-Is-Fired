import { resolveLanguage } from './challenge-language';
import type { ChallengeLanguage } from './game-types';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogLine {
  time: string;
  level: LogLevel;
  text: string;
}

type ConcreteLanguage = Exclude<ChallengeLanguage, 'random'>;

// Each script opens with calm INFO traffic, escalates to a WARN, then breaks
// into a language-specific ERROR + stack frame. Pure data: the UI reveals these
// line by line while Bedrock generates the real challenge in the background.
const STACKS: Record<ConcreteLanguage, ReadonlyArray<[LogLevel, string]>> = {
  php: [
    ['info', 'php-fpm: pool www ready, accepting connections'],
    ['info', 'GET /api/products 200 (38ms)'],
    ['info', 'POST /api/products 201 (54ms)'],
    ['warn', 'Slow query: select * from products (1.21s)'],
    ['error', "PHP Fatal error: Uncaught TypeError in ProductController"],
    ['error', '  at App\\Http\\Controllers\\ProductController->show()'],
    ['error', '  at Illuminate\\Routing\\Controller->callAction()'],
  ],
  javascript: [
    ['info', 'node server listening on :3000'],
    ['info', 'GET /api/products 200 (29ms)'],
    ['info', 'GET /api/products/42 200 (31ms)'],
    ['warn', 'memory usage high: 412MB / 512MB'],
    ['error', 'Uncaught TypeError: Cannot read properties of undefined'],
    ['error', '  at Object.<anonymous> (/app/routes/products.js:42:18)'],
    ['error', '  at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95)'],
  ],
  typescript: [
    ['info', 'ts-node server up on :3000'],
    ['info', 'GET /api/products 200 (27ms)'],
    ['info', 'POST /api/orders 201 (60ms)'],
    ['warn', 'event loop lag detected: 180ms'],
    ['error', "TypeError: Cannot read properties of undefined (reading 'price')"],
    ['error', '  at ProductService.getById (src/services/product.service.ts:58:24)'],
    ['error', '  at ProductController.show (src/controllers/product.controller.ts:31:38)'],
  ],
  python: [
    ['info', 'gunicorn: booting worker with pid 41'],
    ['info', '"GET /api/products HTTP/1.1" 200'],
    ['info', '"GET /api/products/42 HTTP/1.1" 200'],
    ['warn', 'request took 1.4s (threshold 1.0s)'],
    ['error', 'Traceback (most recent call last):'],
    ['error', '  File "app/views/product.py", line 47, in get'],
    ['error', "AttributeError: 'NoneType' object has no attribute 'price'"],
  ],
  go: [
    ['info', 'http: server started on :8080'],
    ['info', 'GET /api/products 200 18ms'],
    ['info', 'GET /api/products/42 200 21ms'],
    ['warn', 'gc pause 12ms (heap 380MB)'],
    ['error', 'panic: runtime error: invalid memory address or nil pointer dereference'],
    ['error', '  main.(*ProductHandler).Show(0xc0000b4000)'],
    ['error', '  /app/handlers/product.go:53 +0x1f4'],
  ],
  java: [
    ['info', 'Tomcat started on port(s): 8080 (http)'],
    ['info', 'GET /api/products 200 (33ms)'],
    ['info', 'POST /api/products 201 (71ms)'],
    ['warn', 'HikariPool-1 connection pool near capacity (9/10)'],
    ['error', 'java.lang.NullPointerException: Cannot invoke "Product.getPrice()"'],
    ['error', '  at com.shop.web.ProductController.show(ProductController.java:48)'],
    ['error', '  at jdk.internal.reflect.GeneratedMethodAccessor.invoke(Unknown Source)'],
  ],
  ruby: [
    ['info', 'puma: listening on tcp://0.0.0.0:3000'],
    ['info', 'Started GET "/api/products" 200 in 26ms'],
    ['info', 'Started GET "/api/products/42" 200 in 28ms'],
    ['warn', 'slow query (1.18s): SELECT "products".* FROM "products"'],
    ['error', "NoMethodError (undefined method `price' for nil:NilClass):"],
    ['error', '  app/controllers/products_controller.rb:31:in `show\''],
    ['error', '  app/middleware/request_logger.rb:18:in `call\''],
  ],
  sql: [
    ['info', 'postgres: database system is ready to accept connections'],
    ['info', 'SELECT * FROM products LIMIT 20 — 12ms'],
    ['info', 'SELECT * FROM products WHERE id = 42 — 8ms'],
    ['warn', 'deadlock detected, retrying transaction'],
    ['error', 'ERROR: null value in column "price" violates not-null constraint'],
    ['error', '  STATEMENT: INSERT INTO products (name, price) VALUES ($1, $2)'],
    ['error', '  current transaction is aborted, commands ignored'],
  ],
};

// Fixed clock so the script is deterministic (no Date.now); the seconds tick
// up across the lines to read like a real, advancing log tail.
function stampAt(index: number): string {
  const base = 14 * 3600 + 32 * 60 + 5; // 14:32:05
  const total = base + index * 2;
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function productionLogScript(language: ChallengeLanguage): LogLine[] {
  const resolved: ConcreteLanguage = resolveLanguage(language);
  return STACKS[resolved].map(([level, text], index) => ({
    time: stampAt(index),
    level,
    text,
  }));
}
