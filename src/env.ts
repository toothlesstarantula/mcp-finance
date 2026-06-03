import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  // App
  PORT: z.coerce.number().int().positive().default(8787),
  TZ: z.string().default("America/Mexico_City"),
  API_KEY_SALT: z.string().default("change_me"),

  // Providers
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("gpt-oss-120-free"),

  // Databases
  DATABASE_URL_FINANCE: z
    .string()
    .url()
    .default("postgresql://postgres:postgres@localhost:5432/finance_db"),
});

export type Env = z.infer<typeof EnvSchema>;

export const env: Env = EnvSchema.parse(process.env);
