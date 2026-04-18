import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('email.host'),
      port: this.configService.get<number>('email.port'),
      secure: this.configService.get<boolean>('email.secure'),
      auth: {
        user: this.configService.get<string>('email.user'),
        pass: this.configService.get<string>('email.password'),
      },
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const frontendUrl = this.configService.get<string>('frontendUrl');
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    const fromAddress = this.configService.get<string>('email.from') || this.configService.get<string>('email.user') || '';

    const mailOptions = {
      from: fromAddress,
      to: email,
      subject: 'Password Reset Request - SubbyMe',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">SubbyMe</h1>
          </div>
          
          <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #667eea; margin-top: 0;">Password Reset Request</h2>
            
            <p>Hello,</p>
            
            <p>We received a request to reset your password for your SubbyMe account. If you didn't make this request, you can safely ignore this email.</p>
            
            <p>To reset your password, click the button below:</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" 
                 style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 14px 28px; 
                        text-decoration: none; 
                        border-radius: 6px; 
                        font-weight: bold; 
                        display: inline-block;
                        box-shadow: 0 4px 6px rgba(102, 126, 234, 0.3);">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">Or copy and paste this link into your browser:</p>
            <p style="background: #fff; padding: 12px; border-radius: 4px; word-break: break-all; font-size: 13px; border: 1px solid #ddd;">
              ${resetUrl}
            </p>
            
            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="margin: 0; color: #856404; font-weight: bold;">⚠️ Security Notice</p>
              <p style="margin: 5px 0 0 0; color: #856404; font-size: 14px;">
                This link will expire in 30 minutes. If you didn't request this reset, please secure your account immediately.
              </p>
            </div>
            
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              If you have any questions or concerns, please contact our support team.
            </p>
            
            <p style="color: #666; font-size: 14px;">
              Best regards,<br>
              <strong>The SubbyMe Team</strong>
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
            <p>© ${new Date().getFullYear()} SubbyMe. All rights reserved.</p>
            <p>This is an automated email. Please do not reply to this message.</p>
          </div>
        </body>
        </html>
      `,
      text: `
Password Reset Request - SubbyMe

Hello,

We received a request to reset your password for your SubbyMe account. If you didn't make this request, you can safely ignore this email.

To reset your password, visit the following link:
${resetUrl}

This link will expire in 30 minutes.

If you have any questions or concerns, please contact our support team.

Best regards,
The SubbyMe Team

© ${new Date().getFullYear()} SubbyMe. All rights reserved.
This is an automated email. Please do not reply to this message.
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }

  async sendWelcomeEmail(to: string, firstName?: string): Promise<void> {
    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'https://subbyme.com';
    const fromAddress =
      this.configService.get<string>('email.from') ||
      this.configService.get<string>('email.user');
    const name = (firstName || '').trim() || 'there';
    const dashboardUrl = `${frontendUrl}/dashboard`;

    const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,0.06);">
          <tr><td style="background:#1d4ed8;color:#ffffff;padding:28px 32px;">
            <div style="font-size:22px;font-weight:700;letter-spacing:0.3px;">SubbyMe</div>
          </td></tr>
          <tr><td style="padding:28px 32px 8px 32px;">
            <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.3;">Hey ${name}, welcome to SubbyMe</h1>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#333;">Thanks for signing up &mdash; stoked to have you on board. Your profile is the first thing builders and head contractors see when they are hunting tradies, so the 5 minutes you spend getting it right pays off every week.</p>
            <p style="margin:0 0 8px 0;font-size:15px;line-height:1.55;color:#333;"><strong>Here is what makes a profile stand out:</strong></p>
            <ol style="margin:0 0 20px 20px;padding:0;font-size:15px;line-height:1.7;color:#333;">
              <li><strong>Finish every section.</strong> Builders literally filter incomplete profiles out before they look &mdash; half-finished = invisible.</li>
              <li><strong>Upload your licences, tickets and insurance.</strong> Verified tradies always show up first in search results.</li>
              <li><strong>Add your ABN.</strong> Most legit builders will not hire without it.</li>
              <li><strong>Pick 3-5 trades you are genuinely strong in</strong> &mdash; depth beats breadth.</li>
              <li><strong>Write a short bio.</strong> A few lines on your experience, the jobs you love, and why a builder should pick you.</li>
              <li><strong>Add photos of past work.</strong> Before/after shots and finished jobs build trust faster than anything else on the platform &mdash; this is the single biggest lever.</li>
              <li><strong>Mark your availability and service area</strong> so you only get pinged for jobs that actually fit.</li>
            </ol>
            <p style="margin:0 0 24px 0;font-size:14px;line-height:1.55;color:#555;">Complete, verified profiles get up to <strong>5x more enquiries</strong> than empty ones.</p>
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px 0;">
              <tr><td style="background:#1d4ed8;border-radius:8px;">
                <a href="${dashboardUrl}" style="display:inline-block;padding:14px 26px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">Complete my profile &rarr;</a>
              </td></tr>
            </table>
            <p style="margin:20px 0 0 0;font-size:14px;line-height:1.55;color:#555;">Got questions? Just hit reply &mdash; this inbox comes straight to us.</p>
            <p style="margin:14px 0 0 0;font-size:14px;line-height:1.55;color:#333;">Cheers,<br/>The SubbyMe team</p>
          </td></tr>
          <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #eee;font-size:12px;color:#888;line-height:1.55;">
            You are receiving this because you signed up at subbyme.com. If this was not you, just reply and we will sort it.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

    const text = [
      `Hey ${name}, welcome to SubbyMe.`,
      '',
      'Thanks for signing up. Your profile is the first thing builders see -- spend 5 minutes getting it right and it pays off every week.',
      '',
      'Tips to stand out:',
      '1. Finish every section -- half-finished profiles are invisible.',
      '2. Upload your licences, tickets and insurance.',
      '3. Add your ABN.',
      '4. Pick 3-5 trades you are genuinely strong in.',
      '5. Write a short bio.',
      '6. Add photos of past work -- the biggest trust lever on the platform.',
      '7. Mark your availability and service area.',
      '',
      'Complete profiles get up to 5x more enquiries than empty ones.',
      '',
      `Complete your profile: ${dashboardUrl}`,
      '',
      'Questions? Just hit reply.',
      '',
      'Cheers,',
      'The SubbyMe team',
    ].join('\n');

    try {
      await this.transporter.sendMail({
        from: fromAddress,
        to,
        subject: "Welcome to SubbyMe -- let's get your profile jobs-ready",
        html,
        text,
      });
    } catch (err) {
      // Don't block signup if welcome email fails
      console.error('[EmailService] sendWelcomeEmail failed:', err);
    }
  }
}
