import "server-only";

/**
 * Domain errors thrown by services. Server Actions turn them into
 * `{ ok: false, error }` results; pages turn NotFoundError into notFound().
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Resource missing, or the user may not know it exists (e.g. non-members). */
export class NotFoundError extends DomainError {}

/** The user is known to the resource but lacks the right to do this. */
export class ForbiddenError extends DomainError {}

/** The action conflicts with current state (duplicates, active borrows…). */
export class ConflictError extends DomainError {}

/** Input failed validation. */
export class ValidationError extends DomainError {}
