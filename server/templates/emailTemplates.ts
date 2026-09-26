
import { getAppBaseUrl } from "../config/env";

// Infrastructure, NOT display branding: the base URL for links inside emails
// comes from the required APP_URL env var (see server/config/env.ts) — there
// is intentionally NO fallback domain. This must NEVER be derived from
// app_name/organizer_name — a domain does not change when branding does.

﻿// Runner-up announcement email - for final round runners-up

// Phase A white-label: brand strings threaded through every template.
// Defaults are byte-identical to the original hardcoded literals.
export interface EmailBrand {
  appName: string;
  footerText: string;
}
export const DEFAULT_EMAIL_BRAND: EmailBrand = {
  appName: "BootFete 2K26",
  footerText: "${brand.footerText}",
};
export function generateRunnerAnnouncementEmail(
  name: string,
  eventName: string,
  roundName: string,
  message?: string,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ðŸ¥ˆ Runner-Up Announcement - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 36px; font-weight: 700;">ðŸ¥ˆ</h1>
                    <h1 style="margin: 10px 0 0; color: white; font-size: 28px; font-weight: 700;">Congratulations, Runner-Up!</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">You have achieved runner-up in ${eventName}!</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #dbeafe; border-left: 4px solid #2563eb; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #1e40af; font-weight: 600; font-size: 16px;">ðŸ¥ˆ Runner-Up Confirmed!</p>
                    </div>
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hello ${name},</h2>
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      We are pleased to announce that you have been declared a <strong>RUNNER-UP</strong> in <strong>${eventName}</strong> (${roundName})!
                    </p>
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your excellent performance has earned you this recognition. Congratulations!
                    </p>
                    ${message ? `
                    <div style="background: #e0e7ff; border-left: 4px solid #6366f1; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0; color: #3730a3; font-size: 15px; line-height: 1.5;">
                        <strong>Message from Organizers:</strong><br/>
                        ${message.replace(/\n/g, '<br/>')}
                      </p>
                    </div>
                    ` : ''}
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
                        <strong>Important:</strong> Please arrive at the venue on time to collect your certificate/prize. Bring your ID card for verification.
                      </p>
                    </div>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${getAppBaseUrl()}/participant/my-tests" 
                         style="display: inline-block; background: linear-gradient(135deg, #60a5fa 0%, #2563eb 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        View Dashboard
                      </a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Congratulations once again! ðŸŽ‰
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      Â© 2026 PG Department of Computer Applications - Bishop Heber College. All rights reserved.
                    </p>
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
export function generateRegistrationReceivedEmail(
  name: string,
  eventName: string,
  registrationId?: string,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Registration Successful - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">PG DEPARTMENT OF COMPUTER APPLICATIONS - BISHOP HEBER COLLEGE</p>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-weight: 600; font-size: 16px;">ðŸŽ‰ Registration Successful!</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hello ${name}!</h2>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.8;">
                      You have successfully registered for <strong style="color: #7c3aed;">${eventName}</strong>.
                    </p>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your application is currently <strong>Pending Approval</strong>. You will receive another email with your login credentials once your registration is confirmed by the committee.
                    </p>

                    ${registrationId ? `
                    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px;">
                          <span style="color: #6b7280; font-size: 14px;">Registration ID</span>
                        </td>
                        <td style="padding: 16px 20px; text-align: right;">
                          <strong style="color: #111827; font-size: 16px; font-family: monospace;">${registrationId}</strong>
                        </td>
                      </tr>
                    </table>
                    ` : ''}

                    <div style="background: #f3f4f6; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                        Only the team leader will receive the initial confirmation, but all team members have been registered.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Questions? Contact our support team
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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

export function generateRegistrationApprovedEmail(
  name: string,
  eventName: string,
  username: string,
  password: string,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Registration Approved - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Header with gradient -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <div style="text-align: center; margin: 0 0 10px 0;">
                      <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px; font-weight: 600;">PG DEPARTMENT OF COMPUTER APPLICATIONS</p>
                      <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 16px; font-weight: 600;">BISHOP HEBER COLLEGE</p>
                    </div>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-weight: 600; font-size: 16px;">âœ“ Registration Approved</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hello ${name}!</h2>
                    
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Congratulations! Your registration for <strong>${eventName}</strong> has been approved.
                    </p>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Below are your login credentials to access the event platform:
                    </p>
                    
                    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Username</span>
                        </td>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 16px; font-family: monospace;">${username}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px 20px;">
                          <span style="color: #6b7280; font-size: 14px;">Password</span>
                        </td>
                        <td style="padding: 16px 20px; text-align: right;">
                          <strong style="color: #111827; font-size: 16px; font-family: monospace;">${password}</strong>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${getAppBaseUrl()}/login" 
                         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        Login to Platform
                      </a>
                    </div>
                    
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                        <strong>Important:</strong> Please keep your credentials secure. Do not share them with anyone.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Need help? Contact our support team
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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

export function generateCredentialsEmail(
  name: string,
  eventName: string,
  username: string,
  password: string,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Event Credentials - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Symposium Management Platform</p>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #1e40af; font-weight: 600; font-size: 16px;">ðŸ”‘ Your Event Credentials</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Welcome ${name}!</h2>
                    
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your registration for <strong>${eventName}</strong> has been successfully completed.
                    </p>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Use these credentials to access the event platform:
                    </p>
                    
                    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Username</span>
                        </td>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 16px; font-family: monospace;">${username}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px 20px;">
                          <span style="color: #6b7280; font-size: 14px;">Password</span>
                        </td>
                        <td style="padding: 16px 20px; text-align: right;">
                          <strong style="color: #111827; font-size: 16px; font-family: monospace;">${password}</strong>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${getAppBaseUrl()}/login" 
                         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        Access Platform
                      </a>
                    </div>
                    
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                        <strong>Security Tip:</strong> Keep your credentials confidential and do not share them with anyone.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Questions? Contact our support team
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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

export function generateTestStartReminderEmail(
  name: string,
  eventName: string,
  roundName: string,
  startTime: Date,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  const formattedTime = startTime.toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short'
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Test Starting Soon - ${roundName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Symposium Management Platform</p>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 16px;">â° Test Reminder</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hi ${name}!</h2>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      This is a reminder that <strong>${roundName}</strong> for <strong>${eventName}</strong> is starting soon.
                    </p>
                    
                    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Event</span>
                        </td>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 16px;">${eventName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Round</span>
                        </td>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 16px;">${roundName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px 20px;">
                          <span style="color: #6b7280; font-size: 14px;">Start Time</span>
                        </td>
                        <td style="padding: 16px 20px; text-align: right;">
                          <strong style="color: #111827; font-size: 16px;">${formattedTime}</strong>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${getAppBaseUrl()}/participant/my-tests" 
                         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        Go to Dashboard
                      </a>
                    </div>
                    
                    <div style="background: #e0e7ff; border-left: 4px solid #6366f1; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #3730a3; font-size: 14px; line-height: 1.5;">
                        <strong>Preparation Tips:</strong> Ensure you have a stable internet connection and your device is fully charged.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Good luck! You've got this! ðŸš€
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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

export function generateResultPublishedEmail(
  name: string,
  eventName: string,
  score: number,
  rank: number,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Results Published - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Symposium Management Platform</p>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #1e40af; font-weight: 600; font-size: 16px;">ðŸ“Š Results Published</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Congratulations ${name}!</h2>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your results for <strong>${eventName}</strong> are now available.
                    </p>
                    
                    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Event</span>
                        </td>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 16px;">${eventName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Your Score</span>
                        </td>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 24px;">${score}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 16px 20px;">
                          <span style="color: #6b7280; font-size: 14px;">Your Rank</span>
                        </td>
                        <td style="padding: 16px 20px; text-align: right;">
                          <strong style="color: #111827; font-size: 24px;">#${rank}</strong>
                        </td>
                      </tr>
                    </table>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${getAppBaseUrl()}/participant/test-results" 
                         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        View Full Results
                      </a>
                    </div>
                    
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
                        <strong>Well Done!</strong> Thank you for participating. Keep up the great work!
                      </p>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Thank you for participating! ðŸŽ‰
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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

export function generateAdminNotificationEmail(
  emailType: string,
  recipientEmail: string,
  recipientName: string,
  eventName: string,
  additionalDetails: Record<string, any>,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  const timestamp = new Date().toLocaleString();
  const detailsHtml = Object.entries(additionalDetails)
    .map(([key, value]) => `
      <tr>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
          <span style="color: #6b7280; font-size: 14px;">${key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
        </td>
        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
          <strong style="color: #111827; font-size: 14px;">${String(value)}</strong>
        </td>
      </tr>
    `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Email Activity Notification</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 700;">ðŸ“§ Email Activity Alert</h1>
                    <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Super Admin Notification</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 30px;">
                    <div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #1e40af; font-weight: 600; font-size: 16px;">Email Sent: ${emailType}</p>
                    </div>
                    
                    <h3 style="margin: 0 0 16px; color: #111827; font-size: 18px;">Email Details</h3>
                    
                    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 20px;">
                      <tr>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Email Type</span>
                        </td>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 14px;">${emailType}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Recipient Name</span>
                        </td>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 14px;">${recipientName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Recipient Email</span>
                        </td>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 14px; font-family: monospace;">${recipientEmail}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Event Name</span>
                        </td>
                        <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 14px;">${eventName}</strong>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 12px 16px;">
                          <span style="color: #6b7280; font-size: 14px;">Sent At</span>
                        </td>
                        <td style="padding: 12px 16px; text-align: right;">
                          <strong style="color: #111827; font-size: 14px;">${timestamp}</strong>
                        </td>
                      </tr>
                    </table>
                    
                    ${Object.keys(additionalDetails).length > 0 ? `
                      <h3 style="margin: 24px 0 16px; color: #111827; font-size: 18px;">Additional Information</h3>
                      <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden;">
                        ${detailsHtml}
                      </table>
                    ` : ''}
                    
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
                        <strong>âœ“ Email sent successfully</strong> - This is an automated notification for email tracking purposes.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 20px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText} | Super Admin Dashboard
                    </p>
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

export function generateConsolidatedRegistrationEmail(
  name: string,
  events: Array<{ name: string }>,
  additionalDetails: { college?: string; rollNo?: string },
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  const eventsList = events.map(event => `<li style="margin: 8px 0; color: #7c3aed; font-weight: 600;">${event.name}</li>`).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Registration Successful</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">PG DEPARTMENT OF COMPUTER APPLICATIONS - BISHOP HEBER COLLEGE</p>
                  </td>
                </tr>
                
                <!-- Content -->
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-weight: 600; font-size: 16px;">ðŸŽ‰ Registration Successful!</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hello ${name}!</h2>
                    
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      You have successfully registered for the following events:
                    </p>
                    
                    <ul style="margin: 0 0 24px 20px; padding: 0; font-size: 16px;">
                      ${eventsList}
                    </ul>

                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your applications are currently <strong>Pending Approval</strong>. You will receive login credentials once your registrations are confirmed.
                    </p>

                    <div style="background: #f3f4f6; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #4b5563; font-size: 14px; line-height: 1.5;">
                        <strong>College:</strong> ${additionalDetails.college || 'N/A'}<br>
                        <strong>Roll No:</strong> ${additionalDetails.rollNo || 'N/A'}
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Questions? Contact our support team
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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

export function generateTestQualificationEmail(
  name: string,
  eventName: string,
  roundName: string,
  score: number,
  maxScore: number,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Round Qualification Update - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Symposium Management Platform</p>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #e0f2fe; border-left: 4px solid #0284c7; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #075985; font-weight: 600; font-size: 16px;">ðŸŽ‰ Round Qualification Update</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hello ${name},</h2>
                    
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      We are pleased to inform you that your performance in the <strong>${roundName}</strong> of <strong>${eventName}</strong> has been reviewed.
                    </p>

                     <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                      <tr>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb;">
                          <span style="color: #6b7280; font-size: 14px;">Your Score</span>
                        </td>
                        <td style="padding: 16px 20px; border-bottom: 1px solid #e5e7eb; text-align: right;">
                          <strong style="color: #111827; font-size: 18px;">${score} / ${maxScore}</strong>
                        </td>
                      </tr>
                    </table>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      You have been selected to proceed to the next round / identified as a qualified participant. Our team will contact you with further details closer to the next stage.
                    </p>
                    
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
                        <strong>Congratulations!</strong> Keep up the great work!
                      </p>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Questions? Contact our support team
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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

// Qualification email with finals venue and time details
export function generateTestQualificationWithFinalsDetailsEmail(
  name: string,
  eventName: string,
  roundName: string,
  score: number,
  maxScore: number,
  finalsRoom: string,
  finalsTime: string,
  message?: string,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  // Finals time is not needed in this email

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Qualified for Finals - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">ðŸŽ‰ Congratulations!</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">You've Qualified for the Finals!</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-weight: 600; font-size: 16px;">âœ“ Round Qualification Confirmed</p>
                    </div>
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hello ${name},</h2>
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      We are thrilled to inform you that your performance in <strong>${roundName}</strong> of <strong>${eventName}</strong> has earned you a spot in the <strong>Finals</strong>!
                    </p>
                    ${message ? `
                    <div style="background: #e0e7ff; border-left: 4px solid #6366f1; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0; color: #3730a3; font-size: 15px; line-height: 1.5;">
                        <strong>Message from Organizers:</strong><br/>
                        ${message.replace(/\n/g, '<br/>')}
                      </p>
                    </div>
                    ` : ''}
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

// Winner announcement email - for final round winners
export function generateWinnerAnnouncementEmail(
  name: string,
  eventName: string,
  roundName: string,
  venueRoom: string,
  dateTime: string,
  message?: string,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ðŸ† Winner Announcement - ${eventName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 36px; font-weight: 700;">ðŸ†</h1>
                    <h1 style="margin: 10px 0 0; color: white; font-size: 28px; font-weight: 700;">Congratulations, Winner!</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 16px;">You've achieved excellence in ${eventName}!</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 16px;">ðŸ† Winner Confirmed!</p>
                    </div>
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Hello ${name},</h2>
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      We are thrilled to announce that you have been declared a <strong>WINNER</strong> in <strong>${eventName}</strong> (${roundName})!
                    </p>
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your exceptional performance has earned you this prestigious recognition. We are incredibly proud of your achievement!
                    </p>
                    ${message ? `
                    <div style="background: #e0e7ff; border-left: 4px solid #6366f1; padding: 16px; margin: 24px 0; border-radius: 4px;">
                      <p style="margin: 0; color: #3730a3; font-size: 15px; line-height: 1.5;">
                        <strong>Message from Organizers:</strong><br/>
                        ${message.replace(/\n/g, '<br/>')}
                      </p>
                    </div>
                    ` : ''}
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-size: 14px; line-height: 1.5;">
                        <strong>Important:</strong> Please arrive at the venue on time to collect your certificate/prize. Bring your ID card for verification.
                      </p>
                    </div>
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${getAppBaseUrl()}/participant/my-tests" 
                         style="display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        View Dashboard
                      </a>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Congratulations once again! ðŸŽ‰
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      Â© 2026 PG Department of Computer Applications - Bishop Heber College. All rights reserved.
                    </p>
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

// Consolidated credentials email - sends all events' credentials in one email

export function generateConsolidatedCredentialsEmail(
  name: string,
  credentials: Array<{ eventName: string; username: string; password: string }>,
  brand: EmailBrand = DEFAULT_EMAIL_BRAND
): string {
  const credentialsHtml = credentials.map(cred => `
    <tr>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb;">
        <strong style="color: #111827; font-size: 14px;">${cred.eventName}</strong>
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        <span style="color: #111827; font-size: 14px; font-family: monospace;">${cred.username}</span>
      </td>
      <td style="padding: 12px 16px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        <span style="color: #111827; font-size: 14px; font-family: monospace;">${cred.password}</span>
      </td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Event Credentials - ${brand.appName}</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table role="presentation" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td align="center" style="padding: 40px 0;">
              <table role="presentation" style="width: 600px; max-width: 100%; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                    <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 700;">${brand.appName}</h1>
                    <p style="margin: 10px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Symposium Management Platform</p>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="background: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin-bottom: 30px; border-radius: 4px;">
                      <p style="margin: 0; color: #166534; font-weight: 600; font-size: 16px;">âœ“ Registration Confirmed</p>
                    </div>
                    
                    <h2 style="margin: 0 0 16px; color: #111827; font-size: 24px;">Congratulations ${name}!</h2>
                    
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Your registration has been confirmed for <strong>${credentials.length} event${credentials.length > 1 ? 's' : ''}</strong>.
                    </p>
                    
                    <p style="margin: 0 0 24px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Below are your login credentials for each event:
                    </p>
                    
                    <table style="width: 100%; border-collapse: collapse; background: #f9fafb; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
                      <thead>
                        <tr>
                          <th style="padding: 12px 16px; border-bottom: 2px solid #e5e7eb; text-align: left; color: #4b5563; font-size: 14px;">Event</th>
                          <th style="padding: 12px 16px; border-bottom: 2px solid #e5e7eb; text-align: center; color: #4b5563; font-size: 14px;">Username</th>
                          <th style="padding: 12px 16px; border-bottom: 2px solid #e5e7eb; text-align: right; color: #4b5563; font-size: 14px;">Password</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${credentialsHtml}
                      </tbody>
                    </table>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${getAppBaseUrl()}/login" 
                         style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                        Login to Platform
                      </a>
                    </div>
                    
                    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin-top: 24px; border-radius: 4px;">
                      <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                        <strong>Important:</strong> Keep your credentials secure. Each event may have different login credentials.
                      </p>
                    </div>
                  </td>
                </tr>
                
                <tr>
                  <td style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 8px; color: #6b7280; font-size: 14px; text-align: center;">
                      Need help? Contact our support team
                    </p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px; text-align: center;">
                      ${brand.footerText}
                    </p>
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
