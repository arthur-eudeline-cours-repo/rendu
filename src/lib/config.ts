import { Effect } from "effect";
import { z } from "zod";
import { CONFIG_FILE } from "./paths";
import {
  ConfigNotFoundError,
  ConfigParseError,
  ConfigReadError,
  ConfigWriteError,
} from "./errors";

export const UserConfigSchema = z.object({
  firstName: z.string().min(1, "Le prénom est requis"),
  lastName: z.string().min(1, "Le nom est requis"),
});

export type UserConfig = z.infer<typeof UserConfigSchema>;

/** Indique si un fichier de configuration existe déjà. */
export const configExists = Effect.tryPromise({
  try: () => Bun.file(CONFIG_FILE).exists(),
  catch: (cause) => new ConfigReadError({ cause }),
});

/** Lit et valide la configuration utilisateur stockée dans ~/.rendu/config.json */
export const readConfig: Effect.Effect<
  UserConfig,
  ConfigReadError | ConfigParseError | ConfigNotFoundError
> = Effect.gen(function* () {
  const file = Bun.file(CONFIG_FILE);

  const exists = yield* Effect.tryPromise({
    try: () => file.exists(),
    catch: (cause) => new ConfigReadError({ cause }),
  });

  if (!exists) {
    return yield* Effect.fail(new ConfigNotFoundError());
  }

  const raw = yield* Effect.tryPromise({
    try: () => file.json(),
    catch: (cause) => new ConfigReadError({ cause }),
  });

  const parsed = UserConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return yield* Effect.fail(new ConfigParseError({ cause: parsed.error }));
  }

  return parsed.data;
});

/** Écrit la configuration utilisateur dans ~/.rendu/config.json */
export const writeConfig = (
  config: UserConfig,
): Effect.Effect<void, ConfigWriteError> =>
  Effect.tryPromise({
    try: async () => {
      await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n");
    },
    catch: (cause) => new ConfigWriteError({ cause }),
  });
