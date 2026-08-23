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

export class RenduIgnoreReadError extends Data.TaggedError("RenduIgnoreReadError")<{
  cause: unknown;
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
  | RenduIgnoreReadError
  | ArchiveWriteError
  | UpgradeError;
