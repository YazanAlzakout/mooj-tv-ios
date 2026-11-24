import test from 'node:test';
import assert from 'node:assert/strict';
import { redactDiagnosticText } from '../src/core/errors/redactDiagnosticText.ts';

test('diagnostics remove query and path credentials, including multiple URLs', () => {
  const input = 'HTTP 403 https://test.invalid/live/sample-user/sample-password/5.ts\n at https://test.invalid/player_api.php?username=sample-user&password=sample-password';
  const output = redactDiagnosticText(input);
  assert.equal(output, 'HTTP 403 [redacted URL]\n at [redacted URL]');
  assert.equal(output.includes('sample-'), false);
});
test('diagnostics retain non-URL error codes and stack locations', () => {
  const input = 'DecoderError: failed\n at Player.ts:42';
  assert.equal(redactDiagnosticText(input), input);
});
