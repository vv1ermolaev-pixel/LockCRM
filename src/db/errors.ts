import { DrizzleQueryError, QueryPromise } from "drizzle-orm";

// Fields of a driver error that name things and never hold the user's data
type DriverErrorFields = { code?: string; table_name?: string; constraint_name?: string; column_name?: string };

// What a failed query leaves in the server log: the SQL with $1, $2 in place of values, and the names of what failed.
// The driver message, its "detail" (Postgres puts the whole row there) and the query values are left out,
// and so is the original error: through it they would get into the log again
export class DatabaseQueryError extends Error {
  readonly code?: string;
  readonly table?: string;
  readonly constraint?: string;
  readonly column?: string;

  constructor(failed: DrizzleQueryError) {
    const driver = (failed.cause ?? {}) as DriverErrorFields;
    const names = [
      driver.code && `code ${driver.code}`,
      driver.table_name && `table ${driver.table_name}`,
      driver.constraint_name && `constraint ${driver.constraint_name}`,
      driver.column_name && `column ${driver.column_name}`,
    ].filter(Boolean);
    super(`Database query failed${names.length > 0 ? ` (${names.join(", ")})` : ""}: ${failed.query}`);
    this.name = "DatabaseQueryError";
    this.code = driver.code;
    this.table = driver.table_name;
    this.constraint = driver.constraint_name;
    this.column = driver.column_name;
    // Only the call frames of the original: its first lines repeat the message with the values
    const frames = failed.stack?.split("\n").filter((line) => line.trimStart().startsWith("at ")) ?? [];
    this.stack = [`${this.name}: ${this.message}`, ...frames].join("\n");
  }
}

const installed = Symbol.for("lockcrm.hideQueryValuesInErrors");

// Drizzle puts every query value into its error ("Failed query: … params: …"), and Next.js logs uncaught errors
// as they are, so a failed save would write the contact's name, phone and notes to the server log.
// Every query is awaited through QueryPromise.then, so this one place covers all of them, new ones included
export function hideQueryValuesInErrors() {
  // Hot reloads in development run this again: wrap only once
  const prototype = QueryPromise.prototype as QueryPromise<unknown> & { [installed]?: true };
  if (prototype[installed]) return;
  prototype[installed] = true;

  const then = QueryPromise.prototype.then;
  QueryPromise.prototype.then = function <TResult1, TResult2 = never>(
    this: QueryPromise<unknown>,
    onFulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return then.call(this, onFulfilled, (reason: unknown): TResult2 | PromiseLike<TResult2> => {
      const error = reason instanceof DrizzleQueryError ? new DatabaseQueryError(reason) : reason;
      if (onRejected) return onRejected(error);
      throw error;
    }) as Promise<TResult1 | TResult2>;
  };
}
