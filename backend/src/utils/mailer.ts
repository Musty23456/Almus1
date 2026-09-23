/**
 * Minimal mailer adapter. In development this just logs the reset link so
 * the flow is testable end-to-end without external config. For production,
 * replace the body of sendPasswordResetEmail with a real provider call
 * (SMTP via nodemailer, SendGrid, Postmark, SES, etc.) - keep the same
 * function signature so nothing else in the codebase needs to change.
 */
export async function sendPasswordResetEmail(to: string, resetToken: string) {
  const resetLink = `almuschat://reset-password?token=${resetToken}`;
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[dev mailer] Password reset link for ${to}: ${resetLink}`);
    return;
  }
  // TODO(production): wire up a real transactional email provider here.
  console.warn('[mailer] No production email provider configured. Reset email NOT sent to', to);
}
