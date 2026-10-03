import { actionEmail } from './layout.js';

export const verifyEmail = (email: string, url: string) =>
  actionEmail({
    subject: 'Verify your email',
    intro: `Confirm that ${email} is your email address.`,
    action: 'Verify email',
    url,
    outro: 'This link expires in 24 hours.',
  });
