// -----------------------------------------------------------------------------
// Errors of the Nissan cloud, told apart because the user's next step differs:
// wrong credentials mean "fix the configuration", anything else means "wait".
// -----------------------------------------------------------------------------

/** The Nissan account refused the login or password. */
export class NissanAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NissanAuthError';
  }
}

/** The Nissan cloud answered with an HTTP error, or not at all. */
export class NissanApiError extends Error {
  /**
   * @param {string} message
   * @param {number} [status] HTTP status, undefined for a network error
   */
  constructor(message, status) {
    super(message);
    this.name = 'NissanApiError';
    this.status = status;
  }
}
