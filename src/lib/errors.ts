import { Data } from "effect";

export class ConfigReadError extends Data.TaggedError("ConfigReadError")<{
  cause: unknown;
}> {}

export class ConfigWriteError extends Data.TaggedError("ConfigWriteError")<{
  cause: unknown;
}> {}

export class ConfigParseError extends Data.TaggedError("ConfigParseError")<{
  cause: unknown;
}> {}

export class ConfigNotFoundError extends Data.TaggedError("ConfigNotFoundError")<{}> {}

export class InvalidPathError extends Data.TaggedError("InvalidPathError")<{
  path: string;
  reason: string;
}> {}

export class RenduFileReadError extends Data.TaggedError("RenduFileReadError")<{
  cause: unknown;
}> {}

export class RenduFileParseError extends Data.TaggedError("RenduFileParseError")<{
  cause: unknown;
}> {}

export class RenduFileWriteError extends Data.TaggedError("RenduFileWriteError")<{
  cause: unknown;
}> {}

export class RenduRootMismatchError extends Data.TaggedError("RenduRootMismatchError")<{
  /** Chemin `root` déclaré dans le `.rendu.yml`. */
  root: string;
  /** Dossier fourni par l'étudiant, dans lequel `root` est introuvable. */
  sourcePath: string;
}> {}

export class FileScanError extends Data.TaggedError("FileScanError")<{
  cause: unknown;
}> {}

export class ArchiveWriteError extends Data.TaggedError("ArchiveWriteError")<{
  cause: unknown;
}> {}

export class UpgradeError extends Data.TaggedError("UpgradeError")<{
  cause: unknown;
}> {}

export type RenduError =
  | ConfigReadError
  | ConfigWriteError
  | ConfigParseError
  | ConfigNotFoundError
  | InvalidPathError
  | RenduFileReadError
  | RenduFileParseError
  | RenduFileWriteError
  | RenduRootMismatchError
  | FileScanError
  | ArchiveWriteError
  | UpgradeError;
