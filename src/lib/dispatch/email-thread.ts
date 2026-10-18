/**
 * Message-ID the "[ NEW ]" partner e-mail is sent with. Reminders reference it
 * (In-Reply-To / References) and reuse its subject, so mail clients file them
 * in the same conversation as the original lead.
 */
export function leadMessageId(dispatchId: string): string {
  return `<lead-${dispatchId}@easyrecharge.ch>`;
}
