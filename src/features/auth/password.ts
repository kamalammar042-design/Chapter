/** Mirrors the server rule (8+ characters, letters and digits). */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Include both letters and numbers.';
  if (pw.length > 72) return 'Use 72 characters or fewer.';
  return null;
}
