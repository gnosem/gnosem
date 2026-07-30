// Errors surface the raw server text + status so callers can log or branch on
// them. The class hierarchy lets you catch broadly (`GnosemError`) or narrowly
// (`GnosemAuthError`). API keys are never included in error messages.

/** Base class for all Gnosem SDK errors. */
export class GnosemError extends Error {
  /** HTTP status code, when the error came from a response. 0 for local errors (timeout, network). */
  readonly status: number;
  /** Raw response body text, when applicable. */
  readonly body: string;

  constructor(message: string, status = 0, body = "") {
    super(message);
    this.name = "GnosemError";
    this.status = status;
    this.body = body;
  }
}

/** 401 / 403 or missing API key. */
export class GnosemAuthError extends GnosemError {
  constructor(message: string, status = 401, body = "") {
    super(message, status, body);
    this.name = "GnosemAuthError";
  }
}

/** 429 rate limit. `retryAfter` is seconds until you may retry (from Retry-After header). */
export class GnosemRateLimitError extends GnosemError {
  /** Seconds until retry is allowed. May be 0 if no Retry-After header was sent. */
  readonly retryAfter: number;

  constructor(message: string, retryAfter = 0, status = 429, body = "") {
    super(message, status, body);
    this.name = "GnosemRateLimitError";
    this.retryAfter = retryAfter;
  }
}

/** Any other non-2xx response from the API (4xx / 5xx). */
export class GnosemAPIError extends GnosemError {
  constructor(message: string, status: number, body = "") {
    super(message, status, body);
    this.name = "GnosemAPIError";
  }
}
