import * as Sentry from "@sentry/bun";
import pkg from "../../package.json" with { type: "json" };

const dsn = process.env.RENDU_SENTRY_DSN;
const disabled = process.env.RENDU_DISABLE_TELEMETRY === "1";

let enabled = false;

/**
 * Initialise Sentry si un DSN a été injecté au build (voir scripts/build.ts)
 * et que l'utilisateur n'a pas désactivé la télémétrie via RENDU_DISABLE_TELEMETRY=1.
 * Aucune donnée personnelle (prénom/nom de l'étudiant) n'est jamais transmise.
 */
export function initSentry(): void {
  if (!dsn || disabled) return;

  Sentry.init({
    dsn,
    release: `rendu@${pkg.version}`,
    environment: process.env.RENDU_SENTRY_ENV ?? "production",
    tracesSampleRate: 0,
  });

  enabled = true;
}

export interface ErrorContext {
  command: string;
  [key: string]: string | number | boolean | undefined;
}

/** Envoie une erreur à Sentry avec le contexte de la commande, sans PII. */
export function reportError(error: unknown, context: ErrorContext): void {
  if (!enabled) return;

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      if (value !== undefined) scope.setTag(key, String(value));
    }
    scope.setTag("os", process.platform);
    scope.setTag("arch", process.arch);
    Sentry.captureException(error instanceof Error ? error : new Error(String(error)));
  });
}

/** Attend l'envoi des événements en file avant que le process ne se termine. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  await Sentry.flush(timeoutMs);
}
