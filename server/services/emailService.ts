// Dual Email Provider Service - Supports Brevo (300/day) and Resend (200/day)
// Auto-switches between providers when limits are reached
// Resets daily at 6:00 AM IST

// @ts-ignore - No type definitions available for sib-api-v3-sdk
// @ts-ignore
// import SibApiV3Sdk from 'sib-api-v3-sdk'; // SDK Removed - causing server hang

import { Resend } from 'resend';
import { storage } from '../storage';
import { getBranding, resolveEventBranding, type EventBranding } from './brandingService';
import { getSenderEmail } from '../config/env';
import type { EmailBrand } from '../templates/emailTemplates';
import { redisClient } from './redisClient';
import {
  generateRegistrationApprovedEmail,
  generateCredentialsEmail,
  generateTestStartReminderEmail,
  generateResultPublishedEmail,
  generateAdminNotificationEmail,
  generateRegistrationReceivedEmail,
  generateConsolidatedRegistrationEmail,
  generateTestQualificationEmail,
  generateTestQualificationWithFinalsDetailsEmail,
  generateConsolidatedCredentialsEmail,
  generateWinnerAnnouncementEmail
} from '../templates/emailTemplates';


// Provider Configuration
export type EmailProvider = 'brevo' | 'resend';

interface ProviderConfig {
  name: EmailProvider;
  dailyLimit: number;
}

const PROVIDERS: Record<EmailProvider, ProviderConfig> = {
  brevo: { name: 'brevo', dailyLimit: 300 },
  resend: { name: 'resend', dailyLimit: 200 }
};

// Redis keys for persistence
const REDIS_KEYS = {
  ACTIVE_PROVIDER: 'email:active_provider',
  PROVIDER_PREFERENCE: 'email:provider_preference'
};

// Brevo Configuration
// Brevo Configuration
// Using fetch instead of SDK because SDK hangs on server environment
const brevoApiStub = {};
// Removed brevoClient and brevoApi global init as we use fetch locally in method


// Resend Configuration
const resend = new Resend('re_MrfD8V24_9vaGegk8Au5vu9mxFiR45Xx9');

interface EmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  recipientName?: string;
  tags?: string[];
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  provider: EmailProvider;
  retryCount?: number;
}

interface ProviderStats {
  provider: EmailProvider;
  used: number;
  limit: number;
  remaining: number;
  percentUsed: number;
}

interface EmailProviderStatus {
  activeProvider: EmailProvider;
  preferredProvider: EmailProvider;
  providers: {
    brevo: ProviderStats;
    resend: ProviderStats;
  };
  totalUsed: number;
  totalLimit: number;
  resetTime: string;
  autoSwitchEnabled: boolean;
}

export class EmailService {
  private static instance: EmailService;
  // Sender identity is deployment infrastructure, not branding: the envelope
  // address comes from the required SENDER_EMAIL env var (see
  // server/config/env.ts). There is intentionally NO fallback — the previous
  // production domain expired, and mail from an unauthenticated domain gets
  // rejected or spam-filtered. When SENDER_EMAIL is unset, sending throws a
  // descriptive error instead of silently using a dead domain.
  private async resolveFromAddress(): Promise<{ name: string; email: string }> {
    const branding = await getBranding();
    return { name: branding.appName, email: getSenderEmail() };
  }

  // Phase B: event-scoped emails resolve the event's own brand snapshot
  // FIRST (callers pass resolveEventBranding(event)). Live global_settings
  // is only the fallback when no event is in scope (multi-event mails,
  // test-email) or the event predates the snapshot migration. footerText
  // is not part of the snapshot (snapshot holds app/organizer/logo only),
  // so it always comes from live settings.
  private async resolveEmailBrand(eventBranding?: EventBranding | null): Promise<EmailBrand> {
    const eb = eventBranding ?? (await resolveEventBranding(null));
    const live = await getBranding();
    return { appName: eb.appName, footerText: live.footerText };
  }
  // Brevo is primary - Resend domain not verified (returns 403)
  private activeProvider: EmailProvider = 'brevo';
  private preferredProvider: EmailProvider = 'brevo';
  private initialized = false;

  constructor() { }

  static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  // Initialize provider from Redis (call this on app start)
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const client = redisClient.getClient();
      if (client) {
        const savedProvider = await client.get(REDIS_KEYS.ACTIVE_PROVIDER);
        const savedPreference = await client.get(REDIS_KEYS.PROVIDER_PREFERENCE);

        if (savedProvider && (savedProvider === 'brevo' || savedProvider === 'resend')) {
          this.activeProvider = savedProvider as EmailProvider;
        }
        if (savedPreference && (savedPreference === 'brevo' || savedPreference === 'resend')) {
          this.preferredProvider = savedPreference as EmailProvider;
        }
      }

      console.log(`[EmailService] Initialized with provider: ${this.activeProvider} (preferred: ${this.preferredProvider})`);
      this.initialized = true;
    } catch (e) {
      console.error('[EmailService] Failed to load provider from Redis, using default:', e);
      this.initialized = true;
    }
  }

  // Get the start of the current day at 6 AM IST
  private getDayStartIST(): Date {
    const now = new Date();
    // IST is UTC+5:30
    const istOffset = 5.5 * 60 * 60 * 1000;
    const utcNow = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
    const istNow = new Date(utcNow + istOffset);

    // Set to 6 AM IST today
    const dayStart = new Date(istNow);
    dayStart.setHours(6, 0, 0, 0);

    // If current time is before 6 AM IST, use yesterday's 6 AM
    if (istNow.getHours() < 6) {
      dayStart.setDate(dayStart.getDate() - 1);
    }

    // Convert back to UTC
    return new Date(dayStart.getTime() - istOffset);
  }

  // Get email count for a provider since 6 AM IST
  async getProviderUsageToday(provider: EmailProvider): Promise<number> {
    try {
      const dayStart = this.getDayStartIST();
      const count = await storage.getEmailLogCountSince(dayStart, provider);
      return count;
    } catch (e) {
      console.error(`[EmailService] Failed to get usage for ${provider}:`, e);
      return 0;
    }
  }

  // Get stats for all providers
  async getProviderStats(): Promise<EmailProviderStatus> {
    await this.initialize();

    const brevoUsed = await this.getProviderUsageToday('brevo');
    const resendUsed = await this.getProviderUsageToday('resend');

    const brevoLimit = PROVIDERS.brevo.dailyLimit;
    const resendLimit = PROVIDERS.resend.dailyLimit;

    const dayStart = this.getDayStartIST();
    const nextReset = new Date(dayStart);
    nextReset.setDate(nextReset.getDate() + 1);

    return {
      activeProvider: this.activeProvider,
      preferredProvider: this.preferredProvider,
      providers: {
        brevo: {
          provider: 'brevo',
          used: brevoUsed,
          limit: brevoLimit,
          remaining: Math.max(0, brevoLimit - brevoUsed),
          percentUsed: Math.round((brevoUsed / brevoLimit) * 100)
        },
        resend: {
          provider: 'resend',
          used: resendUsed,
          limit: resendLimit,
          remaining: Math.max(0, resendLimit - resendUsed),
          percentUsed: Math.round((resendUsed / resendLimit) * 100)
        }
      },
      totalUsed: brevoUsed + resendUsed,
      totalLimit: brevoLimit + resendLimit,
      resetTime: nextReset.toISOString(),
      autoSwitchEnabled: true
    };
  }

  // Check if provider has capacity
  async hasCapacity(provider: EmailProvider): Promise<boolean> {
    const used = await this.getProviderUsageToday(provider);
    return used < PROVIDERS[provider].dailyLimit;
  }

  // Auto-switch to provider with capacity
  async autoSwitchIfNeeded(): Promise<EmailProvider> {
    await this.initialize();

    // Check if current provider has capacity
    if (await this.hasCapacity(this.activeProvider)) {
      return this.activeProvider;
    }

    // Try to switch to the other provider
    const otherProvider: EmailProvider = this.activeProvider === 'brevo' ? 'resend' : 'brevo';

    if (await this.hasCapacity(otherProvider)) {
      console.log(`[EmailService] Auto-switching from ${this.activeProvider} to ${otherProvider} (limit reached)`);
      await this.setActiveProvider(otherProvider);
      return otherProvider;
    }

    // Both providers at limit
    console.warn('[EmailService] Both providers at daily limit!');
    return this.activeProvider;
  }

  // Set the active provider
  async setActiveProvider(provider: EmailProvider): Promise<void> {
    this.activeProvider = provider;
    try {
      const client = redisClient.getClient();
      if (client) {
        await client.set(REDIS_KEYS.ACTIVE_PROVIDER, provider);
      }
      console.log(`[EmailService] Active provider set to: ${provider}`);
    } catch (e) {
      console.error('[EmailService] Failed to save provider to Redis:', e);
    }
  }

  // Set preferred provider (user preference)
  async setPreferredProvider(provider: EmailProvider): Promise<void> {
    this.preferredProvider = provider;
    await this.setActiveProvider(provider);
    try {
      const client = redisClient.getClient();
      if (client) {
        await client.set(REDIS_KEYS.PROVIDER_PREFERENCE, provider);
      }
    } catch (e) {
      console.error('[EmailService] Failed to save preference to Redis:', e);
    }
  }

  // Get current active provider
  getActiveProvider(): EmailProvider {
    return this.activeProvider;
  }

  async getFromAddress(): Promise<{ name: string; email: string }> {
    return this.resolveFromAddress();
  }

  // Send via Brevo (Using Fetch)
  private async sendViaBREVO(options: EmailOptions): Promise<SendResult> {
    try {
      console.log(`[Brevo] Sending to ${options.to}`);

      const apiKey = process.env.BREVO_API_KEY || '';

      const payload = {
        sender: await this.resolveFromAddress(),
        to: [{ email: options.to, name: options.recipientName }],
        subject: options.subject,
        htmlContent: options.htmlContent,
        tags: options.tags || []
      };

      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch (e) {
          errorBody = await response.text();
        }
        console.error('[Brevo] API Failed:', response.status, errorBody);
        return {
          success: false,
          error: typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody),
          provider: 'brevo'
        };
      }

      const data: any = await response.json();
      console.log(`[Brevo] Success! ID: ${data.messageId}`);
      return { success: true, messageId: data.messageId, provider: 'brevo' };

    } catch (error: any) {
      console.error('[Brevo] Network Failed:', error.message);
      return {
        success: false,
        error: error.message,
        provider: 'brevo'
      };
    }
  }

  // Send via Resend
  private async sendViaResend(options: EmailOptions): Promise<SendResult> {
    try {
      console.log(`[Resend] Sending to ${options.to}`);

      const from = await this.resolveFromAddress();
      const { data, error } = await resend.emails.send({
        from: `${from.name} <${from.email}>`,
        to: options.to,
        subject: options.subject,
        html: options.htmlContent,
        tags: options.tags?.map(t => ({ name: 'type', value: t })) || []
      });

      if (error) {
        console.error('[Resend] Failed:', error);
        return { success: false, error: error.message, provider: 'resend' };
      }

      console.log(`[Resend] Success! ID: ${data?.id}`);
      return { success: true, messageId: data?.id, provider: 'resend' };

    } catch (error: any) {
      console.error('[Resend] Failed:', error.message);
      return { success: false, error: error.message, provider: 'resend' };
    }
  }

  // Main send method with auto-switch and retry
  async sendEmail(
    to: string,
    subject: string,
    htmlContent: string,
    templateType: string = 'generic',
    recipientName?: string,
    metadata?: any
  ): Promise<SendResult> {
    await this.initialize();

    // Auto-switch if current provider is at limit
    const provider = await this.autoSwitchIfNeeded();

    const options: EmailOptions = {
      to,
      subject,
      htmlContent,
      recipientName,
      tags: [templateType]
    };

    // Try with active provider
    let result: SendResult;
    if (provider === 'brevo') {
      result = await this.sendViaBREVO(options);
    } else {
      result = await this.sendViaResend(options);
    }

    // If failed, try the other provider
    if (!result.success) {
      const fallbackProvider: EmailProvider = provider === 'brevo' ? 'resend' : 'brevo';
      console.log(`[EmailService] Primary failed, trying fallback provider: ${fallbackProvider}`);

      if (await this.hasCapacity(fallbackProvider)) {
        if (fallbackProvider === 'brevo') {
          result = await this.sendViaBREVO(options);
        } else {
          result = await this.sendViaResend(options);
        }
      }
    }

    // Log the email
    await this.logEmail(
      { to, subject, html: htmlContent, metadata },
      templateType,
      recipientName,
      result
    );

    return result;
  }

  // --- Template Methods ---

  async sendRegistrationReceived(to: string, name: string, eventName: string, registrationId?: string, eventBranding?: EventBranding | null) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateRegistrationReceivedEmail(name, eventName, registrationId, brand);
    return this.sendEmail(to, `Registration Successful - ${eventName}`, html, 'registration_received', name, { eventName });
  }

  async sendConsolidatedRegistrationReceived(to: string, name: string, events: Array<{ name: string }>, details: any, eventBranding?: EventBranding | null) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateConsolidatedRegistrationEmail(name, events, details, brand);
    const eventNames = events.map(e => e.name).join(', ');
    return this.sendEmail(
      to,
      `Registration Successful - ${events.length} Events`,
      html,
      'registration_received_consolidated',
      name,
      { eventNames, eventCount: events.length }
    );
  }

  async sendRegistrationApproved(to: string, name: string, eventName: string, username: string, password: string, eventBranding?: EventBranding | null) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateRegistrationApprovedEmail(name, eventName, username, password, brand);
    return this.sendEmail(to, `Registration Approved - ${eventName}`, html, 'registration_approved', name, { eventName, username });
  }

  async sendCredentials(to: string, name: string, eventName: string, username: string, password: string, eventBranding?: EventBranding | null) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateCredentialsEmail(name, eventName, username, password, brand);
    return this.sendEmail(to, `Your Credentials for ${eventName}`, html, 'credentials_distribution', name, { eventName, username });
  }

  async sendConsolidatedCredentials(
    to: string,
    name: string,
    credentials: Array<{ eventName: string; username: string; password: string }>,
    eventBranding?: EventBranding | null
  ) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateConsolidatedCredentialsEmail(name, credentials, brand);
    const eventNames = credentials.map(c => c.eventName).join(', ');
    return this.sendEmail(
      to,
      `Registration Confirmed - ${credentials.length} Event${credentials.length > 1 ? 's' : ''}`,
      html,
      'credentials_consolidated',
      name,
      { eventNames, eventCount: credentials.length }
    );
  }

  async sendTestStartReminder(to: string, name: string, eventName: string, roundName: string, startTime: Date, eventBranding?: EventBranding | null) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateTestStartReminderEmail(name, eventName, roundName, startTime, brand);
    return this.sendEmail(to, `Test Starting Soon - ${roundName}`, html, 'test_start_reminder', name, { eventName, roundName, startTime });
  }

  async sendResultPublished(to: string, name: string, eventName: string, score: number, rank: number, eventBranding?: EventBranding | null) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateResultPublishedEmail(name, eventName, score, rank, brand);
    return this.sendEmail(to, `Results Published - ${eventName}`, html, 'result_published', name, { eventName, score, rank });
  }

  async sendTestQualification(
    to: string,
    name: string,
    eventName: string,
    roundName: string,
    score: number,
    maxScore: number,
    eventBranding?: EventBranding | null
  ) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateTestQualificationEmail(name, eventName, roundName, score, maxScore, brand);
    return this.sendEmail(
      to,
      `Round Qualification Update - ${eventName}`,
      html,
      'test_result_qualified',
      name,
      { eventName, roundName, score, maxScore }
    );
  }

  async sendTestQualificationWithFinalsDetails(
    to: string,
    name: string,
    eventName: string,
    roundName: string,
    score: number,
    maxScore: number,
    finalsRoom: string,
    finalsTime: string,
    message?: string,
    eventBranding?: EventBranding | null
  ) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateTestQualificationWithFinalsDetailsEmail(name, eventName, roundName, score, maxScore, finalsRoom, finalsTime, message, brand);
    return this.sendEmail(
      to,
      `ðŸŽ‰ You're Qualified! Finals Details - ${eventName}`,
      html,
      'test_result_qualified_with_finals',
      name,
      { eventName, roundName, score, maxScore, finalsRoom, finalsTime, message }
    );
  }

  async sendWinnerAnnouncement(
    to: string,
    name: string,
    eventName: string,
    roundName: string,
    venueRoom: string,
    dateTime: string,
    message?: string,
    eventBranding?: EventBranding | null
  ) {
    const brand = await this.resolveEmailBrand(eventBranding);
    const html = generateWinnerAnnouncementEmail(name, eventName, roundName, venueRoom, dateTime, message, brand);
    return this.sendEmail(
      to,
      `ðŸ† Congratulations! You are a Winner in ${eventName}`,
      html,
      'winner_announcement',
      name,
      { eventName, roundName, venueRoom, dateTime, message }
    );
  }

  async sendGeneralEmail(to: string, name: string, subject: string, content: string) {
    return this.sendEmail(
      to,
      subject,
      `<html><body><h1>Hello ${name},</h1><p>${content}</p></body></html>`,
      'general_notification',
      name
    );
  }

  // --- Logging ---


  private async logEmail(
    options: { to: string; subject: string; html: string; metadata?: any },
    templateType: string,
    recipientName: string | undefined,
    result: SendResult
  ) {
    try {
      await storage.createEmailLog({
        recipientEmail: options.to,
        recipientName: recipientName || null,
        subject: options.subject,
        templateType,
        status: result.success ? 'sent' : 'failed',
        metadata: {
          ...(options.metadata || {}),
          provider: result.provider,
          retryCount: result.retryCount || 0
        },
        errorMessage: result.error || null
      });
    } catch (e) {
      console.error('[EmailService] Log failed:', e);
    }
  }
}

export const emailService = EmailService.getInstance();
