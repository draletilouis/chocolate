import nodemailer from 'nodemailer';
import { env } from '../env';

export const mailConfigured = () => Boolean(env.mail.host);

export async function sendMail(message: { to: string; subject: string; text: string; html?: string }) {
  if (!mailConfigured()) throw Object.assign(new Error('Recovery email is not configured. Contact your administrator.'), { status: 503 });
  const transport = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.port === 465,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.password } : undefined,
  });
  await transport.sendMail({ from: env.mail.from, ...message });
}
