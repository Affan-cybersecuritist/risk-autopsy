// Shared strong-password policy for signup. Kept separate from Login.tsx so
// the rule and its message can't drift out of sync with each other.
const MIN_LENGTH = 8

export function passwordIssues(password: string): string[] {
  const issues: string[] = []
  if (password.length < MIN_LENGTH) issues.push(`at least ${MIN_LENGTH} characters`)
  if (!/[a-z]/.test(password)) issues.push('a lowercase letter')
  if (!/[A-Z]/.test(password)) issues.push('an uppercase letter')
  if (!/[0-9]/.test(password)) issues.push('a number')
  if (!/[^A-Za-z0-9]/.test(password)) issues.push('a symbol (e.g. !@#$%)')
  return issues
}

export function isStrongPassword(password: string): boolean {
  return passwordIssues(password).length === 0
}

// 0-4 score for a live strength meter - not the validity check itself.
export function passwordStrength(password: string): number {
  if (!password) return 0
  const satisfied = 5 - passwordIssues(password).length
  return Math.max(0, Math.min(4, satisfied - 1))
}
