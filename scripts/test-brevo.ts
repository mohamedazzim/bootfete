
// @ts-ignore
import SibApiV3Sdk from 'sib-api-v3-sdk';

const apiKey = process.env.BREVO_API_KEY?.trim();
if (!apiKey) {
    console.error("BREVO_API_KEY is not set. Export it before running this script.");
    process.exit(1);
}

async function testBrevo() {
    console.log("Testing Brevo API connection...");

    const client = SibApiV3Sdk.ApiClient.instance;
    const auth = client.authentications['api-key'];
    auth.apiKey = apiKey;

    const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

    // 1. Send as info@bootfete2k26.tech
    console.log("\n--- Test 1: Sending as info@bootfete2k26.tech ---");
    const send1 = new SibApiV3Sdk.SendSmtpEmail();
    send1.subject = "Test 1";
    send1.htmlContent = "<html><body><h1>Test 1</h1></body></html>";
    send1.sender = { "name": "BootFete", "email": "info@bootfete2k26.tech" };
    send1.to = [{ "email": "debug@example.com", "name": "Debugger" }];

    try {
        await emailApi.sendTransacEmail(send1);
        console.log('✅ Test 1 Success!');
    } catch (e: any) {
        console.log('❌ Test 1 Failed:', e.response?.body || e.message);
    }

    // 2. Send as Account Email (ca245213133@bhc.edu.in)
    console.log("\n--- Test 2: Sending as ca245213133@bhc.edu.in ---");
    const send2 = new SibApiV3Sdk.SendSmtpEmail();
    send2.subject = "Test 2";
    send2.htmlContent = "<html><body><h1>Test 2</h1></body></html>";
    send2.sender = { "name": "Mohamed Azzim", "email": "ca245213133@bhc.edu.in" };
    send2.to = [{ "email": "debug@example.com", "name": "Debugger" }];

    try {
        await emailApi.sendTransacEmail(send2);
        console.log('✅ Test 2 Success!');
    } catch (e: any) {
        console.log('❌ Test 2 Failed:', e.response?.body || e.message);
    }
}

testBrevo();
