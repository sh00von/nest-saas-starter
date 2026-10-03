import { actionEmail } from './layout.js';

export const resetPassword = (email: string, url: string) =>
  actionEmail({
    subject: 'Reset your password',
    intro: `Someone asked to reset the password for ${email}.`,
    action: 'Reset password',
    url,
    outro:
      "This link expires in 1 hour. If this wasn't you, ignore this email; your password stays the same.",
  });
