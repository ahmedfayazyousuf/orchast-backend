import { z } from 'zod';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const origin = z
  .string()
  .trim()
  .url()
  .transform((value) => value.replace(/\/+$/, ''));

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(1918),
  APP_URL: origin.default('http://localhost:1918'),
  FRONTEND_URL: origin.default('http://localhost:1818'),
  COOKIE_SECRET: z.string().min(32),
  COOKIE_DOMAIN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SUPABASE_URL: origin,
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  /**
   * Only for a project that still signs tokens with the legacy JWT secret.
   * New projects publish a JWKS and should leave this empty.
   */
  SUPABASE_JWT_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().min(32).optional(),
  ),
});

export type Env = z.infer<typeof envSchema>;
