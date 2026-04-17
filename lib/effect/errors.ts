type ErrorInput = {
  message: string;
  cause?: unknown;
  details?: Record<string, unknown>;
};

class TaggedAppError extends Error {
  readonly _tag: string;
  readonly cause?: unknown;
  readonly details?: Record<string, unknown>;

  constructor(tag: string, input: ErrorInput) {
    super(input.message);
    this.name = tag;
    this._tag = tag;
    this.cause = input.cause;
    this.details = input.details;
  }
}

export class AppConfigError extends TaggedAppError {
  constructor(input: ErrorInput) {
    super("AppConfigError", input);
  }
}

export class ValidationError extends TaggedAppError {
  constructor(input: ErrorInput) {
    super("ValidationError", input);
  }
}

export class ExternalServiceError extends TaggedAppError {
  constructor(input: ErrorInput) {
    super("ExternalServiceError", input);
  }
}

export class WorkflowTransientError extends TaggedAppError {
  constructor(input: ErrorInput) {
    super("WorkflowTransientError", input);
  }
}

export class WorkflowPermanentError extends TaggedAppError {
  constructor(input: ErrorInput) {
    super("WorkflowPermanentError", input);
  }
}

export class WorkflowAmbiguousError extends TaggedAppError {
  constructor(input: ErrorInput) {
    super("WorkflowAmbiguousError", input);
  }
}

export function isRetryableWorkflowError(error: unknown) {
  return (
    error instanceof WorkflowTransientError ||
    error instanceof WorkflowAmbiguousError
  );
}
