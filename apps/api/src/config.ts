import { z } from 'zod';

/** Development-only secret. */
export const INSECURE_DEV_AUTH_SECRET = 'dev-only-insecure-secret-change-me-0123456789abcdef';
/** Placeholder shipped in .env.example. */
export const PLACEHOLDER_AUTH_SECRET = 'replace-this-with-a-long-random-secret-before-deploying';

/** Well-known secrets: production refuses to boot with any of them. */
const KNOWN_INSECURE_AUTH_SECRETS = new Set([INSECURE_DEV_AUTH_SECRET, PLACEHOLDER_AUTH_SECRET]);

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    /** Comma-separated list of allowed browser origins. */
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    /** Public address of the web app, used to build links in e-mails. */
    WEB_BASE_URL: z.string().url().default('http://localhost:5173'),

    /** Signs access tokens. At least 32 characters. */
    AUTH_SECRET: z
      .string()
      .min(32, 'must have at least 32 characters (generate one with: openssl rand -base64 48)'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(30)
      .default(15 * 60),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).default(30),
    /** Marks cookies `Secure`. Defaults to on in production; turn off only behind plain HTTP. */
    COOKIE_SECURE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    /** Trust X-Forwarded-For. Enable only behind a reverse proxy you control, or clients can spoof IPs. */
    TRUST_PROXY: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    /** Disables rate limiting. Meant for automated tests only. */
    RATE_LIMIT_DISABLED: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),

    /**
     * Lets webhooks reach loopback, private and link-local addresses, and use plain http. Off by
     * default so an admin account cannot be used to probe the internal network or cloud metadata.
     */
    WEBHOOKS_ALLOW_PRIVATE_NETWORKS: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),

    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().default('OpenCourse <no-reply@opencourse.local>'),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || !KNOWN_INSECURE_AUTH_SECRETS.has(env.AUTH_SECRET),
    {
      path: ['AUTH_SECRET'],
      message: 'is a well-known placeholder: set a private random value in production',
    },
  )
  .transform((env) => ({
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
  }));

export type Config = z.infer<typeof configSchema>;

/** Parses and validates environment variables; throws a readable error on invalid input. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
