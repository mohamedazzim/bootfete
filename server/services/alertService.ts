import logger from './loggerService';

type AlertLevel = 'CRITICAL' | 'WARNING' | 'INFO';

class AlertService {
    async sendAlert(level: AlertLevel, title: string, details: any) {
        // Log the alert
        logger.log(level.toLowerCase(), title, details);

        if (level === 'CRITICAL') {
            await this.sendEmailAlert(title, details);
            await this.sendSlackAlert(title, details, '#FF0000');
            await this.sendSMS(`[CRITICAL] ${title}`);
        } else if (level === 'WARNING') {
            await this.sendSlackAlert(title, details, '#FFA500');
        }
    }

    private async sendEmailAlert(title: string, details: any) {
        // Placeholder: Implement actual email sending logic (e.g., via SendGrid/Resend)
        // console.log(`[EMAIL ALERT] ${title}`, details);
    }

    private async sendSlackAlert(title: string, details: any, color: string) {
        // Placeholder: Implement Slack webhook logic
        // console.log(`[SLACK ALERT] ${title} (${color})`, details);
    }

    private async sendSMS(message: string) {
        // Placeholder: Implement SMS logic (e.g., Twilio)
        // console.log(`[SMS ALERT] ${message}`);
    }
}

export const alertService = new AlertService();
