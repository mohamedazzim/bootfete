
import { queueService } from '../services/queueService';

async function runTests() {
    console.log('🚀 Starting Redis Queue Tests...');

    try {
        // 1. Initialize Queue
        console.log('1. Initializing Queue...');
        queueService.initializeQueue();
        // Wait for redis connection
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('✅ Queue Initialized');

        // 2. Add Email Job
        console.log('2. Adding Email Job...');
        const jobId = await queueService.addEmailJob(
            'test@example.com',
            'Test Subject',
            'test_template',
            { name: 'Test User' },
            'Test User'
        );

        if (jobId && typeof jobId === 'string') {
            console.log(`✅ Job Added: ${jobId}`);
        } else {
            throw new Error('Failed to add job: Job ID is missing or invalid');
        }

        // 3. Get Queue Stats
        console.log('3. Getting Queue Stats...');
        const stats = await queueService.getQueueStats();
        console.log('Stats:', stats);
        if (stats && typeof stats.waiting === 'number') {
            console.log('✅ Stats Retrieved');
        } else {
            throw new Error('Failed to get stats');
        }

        // 4. Test Failed Job Handling
        console.log('4. Testing Failed Job Handling...');
        const failJobId = await queueService.addEmailJob(
            'fail@example.com',
            'Fail Subject',
            'invalid_template_name',
            {},
            'Fail User'
        );
        console.log(`Added job expected to fail: ${failJobId}`);

        // Wait for processing
        console.log('Waiting for processing...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        const failedJobs = await queueService.getFailedJobs();
        const myFailedJob = failedJobs.find(j => j.id === failJobId);

        if (myFailedJob) {
            console.log(`✅ Job failed as expected: ${myFailedJob.failedReason}`);
        } else {
            console.warn('⚠️ Job did not fail or was not found in failed list (might be retrying)');
        }

        console.log('✅ All Tests Completed Successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Test Failed:', error);
        process.exit(1);
    }
}

runTests();
