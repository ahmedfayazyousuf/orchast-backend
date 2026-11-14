import { z } from 'zod';

export const startQuerySchema = z.object({
  format: z
    .enum(['redirect', 'json'])
    .optional()
    .describe(
      'json returns the authorize URL. The default redirects the browser.',
    ),
});

export type StartQuery = z.infer<typeof startQuerySchema>;

export const callbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export type CallbackQuery = z.infer<typeof callbackQuerySchema>;

export const refreshBodySchema = z
  .object({
    refreshToken: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Omit this in the browser. The httpOnly cookie is used instead.',
      ),
  })
  .default({ refreshToken: undefined });

export type RefreshBody = z.infer<typeof refreshBodySchema>;
