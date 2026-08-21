/**
 * An id that is not an id.
 *
 * Postgres refuses to compare a uuid column against text that is not a uuid, and it
 * refuses by raising, not by returning nothing. So a URL with junk in the id position
 * reaches a repository and comes back as a 500 with a database error in it, when the
 * honest answer is that there is no such row.
 *
 * Every read addressed by a path segment checks this first.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID.test(value);
