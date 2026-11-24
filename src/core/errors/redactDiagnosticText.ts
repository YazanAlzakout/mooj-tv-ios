/** Native media errors can embed complete credential-bearing stream URLs. */
export function redactDiagnosticText(value: string): string {
  return value.replace(/https?:\/\/[^\s<>"']+/gi, '[redacted URL]');
}
