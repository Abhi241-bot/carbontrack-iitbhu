import nodemailer from 'nodemailer';
import config from '../config/env';
import logger from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

function buildEmailHtml(title: string, bodyHtml: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
    </head>
    <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 0;">
        <tr>
          <td align="center">
            <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
              <tr>
                <td style="background:#8B1A1A;padding:24px 32px;">
                  <p style="margin:0;color:#ffffff;font-size:18px;font-weight:bold;letter-spacing:0.3px;">IIT BHU Carbon Portal</p>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;color:#374151;font-size:15px;line-height:1.6;">
                  ${bodyHtml}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px;background:#f3f4f6;color:#9ca3af;font-size:12px;border-top:1px solid #e5e7eb;">
                  IIT BHU, Varanasi 221005
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}

export async function sendVerificationEmail(to: string, name: string, rawToken: string): Promise<void> {
  try {
    const link = `${config.clientUrl}/verify-email/${rawToken}`;
    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: 'Verify your IIT BHU Carbon Portal account',
      html: buildEmailHtml(
        'Verify your account',
        `<p>Hello ${name},</p>
        <p>Click the link below to verify your email address. This link expires in <strong>24 hours</strong>.</p>
        <p style="margin:28px 0;">
          <a href="${link}" style="background:#8B1A1A;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
            Verify Email Address
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">Or copy this link into your browser:<br/><a href="${link}" style="color:#8B1A1A;">${link}</a></p>
        <p style="color:#6b7280;font-size:13px;">If you did not create this account, you can safely ignore this email.</p>`
      ),
    });
  } catch (err) {
    logger.error('sendVerificationEmail failed', { to, err });
  }
}

export async function sendPasswordResetEmail(to: string, name: string, rawToken: string): Promise<void> {
  try {
    const link = `${config.clientUrl}/reset-password/${rawToken}`;
    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: 'Reset your Carbon Portal password',
      html: buildEmailHtml(
        'Reset your password',
        `<p>Hello ${name},</p>
        <p>Click the link below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <p style="margin:28px 0;">
          <a href="${link}" style="background:#8B1A1A;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;">Or copy this link into your browser:<br/><a href="${link}" style="color:#8B1A1A;">${link}</a></p>
        <p style="color:#6b7280;font-size:13px;">If you did not request this, you can safely ignore this email. Your password will not change.</p>`
      ),
    });
  } catch (err) {
    logger.error('sendPasswordResetEmail failed', { to, err });
  }
}

export async function sendWelcomeEmail(to: string, name: string): Promise<void> {
  try {
    const buildingsLink = `${config.clientUrl}/buildings`;
    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: 'Welcome to IIT BHU Carbon Portal',
      html: buildEmailHtml(
        'Welcome',
        `<p>Hello ${name},</p>
        <p>Welcome to the <strong>IIT BHU Carbon Portal</strong>! Your account has been verified and is ready to use.</p>
        <p>You can now log in and start tracking carbon emissions for campus buildings.</p>
        <p style="margin:28px 0;">
          <a href="${buildingsLink}" style="background:#8B1A1A;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block;">
            Explore Buildings
          </a>
        </p>`
      ),
    });
  } catch (err) {
    logger.error('sendWelcomeEmail failed', { to, err });
  }
}
