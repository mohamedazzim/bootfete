import Queue from 'bull';
import { emailService } from './emailService';
import { redisClient } from './redisClient';

interface EmailJobData {
    to: string;
    subject: string;
    templateName: string;
    variables: any;
    recipientName?: string;
}

class QueueService {
    private emailQueue: Queue.Queue<EmailJobData> | null = null;
    private isInitialized = false;

    constructor() {
        // Queue will be initialized in initializeQueue()
    }

    initializeQueue() {
        if (this.isInitialized) return;

        try {
            const redisConfig = {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
            };

            console.log('Initializing Email Queue with Redis config:', { ...redisConfig, password: '***' });

            this.emailQueue = new Queue<EmailJobData>('email-queue', {
                redis: redisConfig,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 1000, // 1s, 2s, 4s
                    },
                    removeOnComplete: true, // Keep memory clean
                    removeOnFail: false, // Keep failed jobs for inspection
                    timeout: 60000, // 60s timeout
                },
            });

            this.setupJobProcessor();
            this.setupEventListeners();
            this.isInitialized = true;
            console.log('✅ Email Queue initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize Email Queue:', error);
            // We don't throw here to allow the app to start, 
            // addEmailJob will handle the fallback if queue is null
        }
    }

    private setupJobProcessor() {
        if (!this.emailQueue) return;

        this.emailQueue.process(5, async (job) => {
            const { to, subject, templateName, variables, recipientName } = job.data;

            console.log(`🔄 Processing email job ${job.id} for ${to} (${templateName})`);

            try {
                // Map template names to emailService methods or generic send
                // Since emailService has specific methods, we might need to map them or use a generic send if available.
                // Looking at emailService, it has specific methods like sendRegistrationApproved, etc.
                // But also a generic sendEmail method.
                // For flexibility, we'll use the generic sendEmail method if possible, 
                // or map specific template names to specific methods if strictly required.
                // However, the user request implies generic usage: "Render email template with variables"
                // But emailService.ts (from previous context) has specific methods that generate HTML.
                // To support the "templateName" approach requested, we might need to refactor emailService 
                // or just map the known types to the specific methods here.

                // Let's use a mapping strategy for the known types in the user request
                let result;

                switch (templateName) {
                    case 'registration_approved':
                        result = await emailService.sendRegistrationApproved(
                            to,
                            variables.name,
                            variables.eventName,
                            variables.username,
                            variables.password
                        );
                        break;
                    case 'credentials_distribution':
                        result = await emailService.sendCredentials(
                            to,
                            variables.name,
                            variables.eventName,
                            variables.username,
                            variables.password
                        );
                        break;
                    case 'test_start_reminder':
                        result = await emailService.sendTestStartReminder(
                            to,
                            variables.name,
                            variables.eventName,
                            variables.roundName,
                            new Date(variables.startTime)
                        );
                        break;
                    case 'result_published':
                        result = await emailService.sendResultPublished(
                            to,
                            variables.name,
                            variables.eventName,
                            variables.score,
                            variables.rank
                        );
                        break;
                    // Add other cases as needed, or fallback to generic if we can construct HTML
                    default:
                        // If we have raw HTML in variables (not ideal but possible) or if we just want to log
                        console.warn(`⚠️ Unknown template name: ${templateName}. Job ${job.id} might fail.`);
                        throw new Error(`Unknown template name: ${templateName}`);
                }

                if (!result.success) {
                    throw new Error(result.error || 'Email sending failed');
                }

                return { success: true, messageId: result.messageId };
            } catch (error) {
                console.error(`❌ Job ${job.id} failed:`, error);
                throw error; // Triggers retry
            }
        });
    }

    private setupEventListeners() {
        if (!this.emailQueue) return;

        this.emailQueue.on('completed', (job, result) => {
            console.log(`✅ Job ${job.id} completed! Result:`, result);
        });

        this.emailQueue.on('failed', (job, err) => {
            console.error(`❌ Job ${job.id} failed after attempts. Error:`, err);
            // Alert admin logic could go here (e.g., send an email to admin via direct channel)
        });

        this.emailQueue.on('error', (error) => {
            console.error('🔥 Queue error:', error);
        });
    }

    async addEmailJob(
        to: string,
        subject: string,
        templateName: string,
        variables: any,
        recipientName?: string
    ): Promise<string | null> {
        // Fallback if queue is not initialized or Redis is down
        if (!this.emailQueue || !this.isInitialized) {
            console.warn('⚠️ Queue not available. Falling back to direct send.');
            return this.fallbackDirectSend(to, subject, templateName, variables, recipientName);
        }

        try {
            const job = await this.emailQueue.add({
                to,
                subject,
                templateName,
                variables,
                recipientName
            });
            console.log(`📥 Added email job ${job.id} to queue`);
            return job.id.toString();
        } catch (error) {
            console.error('❌ Failed to add job to queue. Falling back to direct send.', error);
            return this.fallbackDirectSend(to, subject, templateName, variables, recipientName);
        }
    }

    private async fallbackDirectSend(
        to: string,
        subject: string,
        templateName: string,
        variables: any,
        recipientName?: string
    ): Promise<string | null> {
        try {
            console.log('🔄 Attempting direct send fallback...');
            // Re-use the same switch logic or call a helper
            // For simplicity, we'll duplicate the switch or extract it. 
            // Since this is a fallback, we just want to try sending.

            // Note: This duplicates logic from processJob. In a real app, extract to `processEmailLogic`.
            let result;
            switch (templateName) {
                case 'registration_approved':
                    result = await emailService.sendRegistrationApproved(to, variables.name, variables.eventName, variables.username, variables.password);
                    break;
                case 'credentials_distribution':
                    result = await emailService.sendCredentials(to, variables.name, variables.eventName, variables.username, variables.password);
                    break;
                case 'test_start_reminder':
                    result = await emailService.sendTestStartReminder(to, variables.name, variables.eventName, variables.roundName, new Date(variables.startTime));
                    break;
                case 'result_published':
                    result = await emailService.sendResultPublished(to, variables.name, variables.eventName, variables.score, variables.rank);
                    break;
                default:
                    throw new Error(`Unknown template name: ${templateName}`);
            }

            if (result.success) {
                console.log('✅ Direct send fallback successful');
                return 'fallback-direct-send';
            } else {
                console.error('❌ Direct send fallback failed:', result.error);
                return null;
            }
        } catch (error) {
            console.error('❌ Direct send fallback exception:', error);
            return null;
        }
    }

    async getQueueStats() {
        if (!this.emailQueue) return { error: 'Queue not initialized' };

        const [active, waiting, completed, failed, delayed] = await Promise.all([
            this.emailQueue.getActiveCount(),
            this.emailQueue.getWaitingCount(),
            this.emailQueue.getCompletedCount(),
            this.emailQueue.getFailedCount(),
            this.emailQueue.getDelayedCount(),
        ]);

        return {
            active,
            waiting,
            completed,
            failed,
            delayed,
            total: active + waiting + completed + failed + delayed
        };
    }

    async getFailedJobs() {
        if (!this.emailQueue) return [];
        const jobs = await this.emailQueue.getFailed();
        return jobs.map(job => ({
            id: job.id,
            data: job.data,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            finishedOn: job.finishedOn,
            processedOn: job.processedOn
        }));
    }

    async retryJob(jobId: string) {
        if (!this.emailQueue) return false;
        const job = await this.emailQueue.getJob(jobId);
        if (job) {
            await job.retry();
            return true;
        }
        return false;
    }
}

export const queueService = new QueueService();
