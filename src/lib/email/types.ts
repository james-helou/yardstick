/** What every template produces and every provider accepts. */
export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where a reply should land. The agency, not us. */
  replyTo?: string | null;
};

export type SentEmail = { id: string };

export type EmailProvider = {
  name: string;
  /** The address the provider is allowed to send from, decided by config, not by a caller. */
  from: string;
  send(message: EmailMessage, options?: { signal?: AbortSignal }): Promise<SentEmail>;
};
