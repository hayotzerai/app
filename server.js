require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const nodemailer = require('nodemailer');
const { createAndPushRepo } = require('./github.js');
const fs = require('fs').promises;
const path = require('path');
const os = require('os'); // Add this to handle temporary directories

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Store OTP codes temporarily (in production, use a proper database)
const otpStore = new Map();

// Create email transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD // Use App Password for Gmail
    }
});

// Generate OTP
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

app.post('/send-otp', async (req, res) => {
    const { email } = req.body;

    try {
        const otp = generateOTP();
        
        // Email options
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'Your Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Verification Code</h2>
                    <p>Your verification code is:</p>
                    <h1 style="color: #0066cc; font-size: 32px; letter-spacing: 5px;">${otp}</h1>
                    <p>This code will expire in 5 minutes.</p>
                </div>
            `
        };

        // Send email
        await transporter.sendMail(mailOptions);
        
        // Store OTP with 5-minute expiration
        otpStore.set(email, otp);
        setTimeout(() => otpStore.delete(email), 5 * 60 * 1000);

        res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Email error:', error);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

app.post('/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    const storedOTP = otpStore.get(email);

    if (storedOTP && storedOTP === otp) {
        otpStore.delete(email);
        res.status(200).json({ message: 'OTP verified successfully' });
    } else {
        res.status(400).json({ error: 'Invalid OTP' });
    }
});

app.get('/stream', async (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const userDescription = req.query.description;
    const businessId = req.query.businessId;
    const businessName = req.query.businessName || 'Business';
    let generatedHTML = ''; // Add this to store the complete HTML

    const sendStatus = (message, type = 'status') => {
        res.write(`data: {"type": "${type}", "message": ${JSON.stringify(message)}}\n\n`);
    };

    try {
        sendStatus('🚀 מתחיל בתהליך יצירת דף הנחיתה...');
        
        const stream = await openai.chat.completions.create({
            model: 'o4-mini-2025-04-16',
            stream: true,
            messages: [{ 
                role: 'user', 
                content: `Create a high-conversion landing page in Hebrew for: ${userDescription}. 
                Business name: ${businessId}.
                Use only valid HTML with Tailwind CSS classes.
                Use photos ONLY from dreamstime.com.
                Make sure the layout is optimized for Israeli audiences:
                - Hebrew language with full RTL alignment.
                - In the hero section, use a full-width background image behind the text by setting a \`div\` with \`bg-[url('IMAGE_URL')]\`, \`bg-cover\`, \`bg-center\`, and \`relative\`, and position the headline, subheadline, and call-to-action inside a child \`div\` with \`absolute\` or \`z-10\`.
                - Include a bold main headline, a subheadline, and a call-to-action button overlaid on the hero background.
                - Include a section with key features or benefits (bulleted).
                - Add a technical or product specification table if relevant.
                - Include trust signals like warranty, reviews, or guarantees.
                - Make the design colorful and friendly, with fonts and layout common to Israeli e-commerce pages.
                Return only the full HTML content, no additional explanation.`
            }]

        });

        for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
                generatedHTML += content; // Accumulate the HTML
                res.write(`data: {"type": "content", "chunk": ${JSON.stringify(content)}}\n\n`);
            }
        }

        // Create and push to GitHub after generation is complete
        sendStatus('📁 מכין את המאגר ב-GitHub...');

        // Save the generated HTML to a temporary file
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `landingPage_${Date.now()}.html`);
        await fs.writeFile(tempFilePath, generatedHTML, 'utf8');

        // Pass the temporary file path to createAndPushRepo
        const repoUrl = await createAndPushRepo(tempFilePath, {
            name: businessId, // Pass business ID or other relevant data
            description: userDescription
        });

        res.write(`data: {"type": "repo_url", "url": "${repoUrl}"}\n\n`);
        sendStatus('🎉 המאגר נוצר בהצלחה!', 'success');

        // Clean up the temporary file after use
        await fs.unlink(tempFilePath);

        // Send completion status
        res.write(`data: {"type": "done"}\n\n`);
    } catch (error) {
        console.error('Stream error:', error);
        res.write(`data: {"type": "error", "message": "אירעה שגיאה ביצירת דף הנחיתה"}\n\n`);
    }
});

// Add this new route
app.get('/update-stream', async (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const { businessId, description, editRequest, currentRepoName } = req.query;
    let generatedHTML = '';

    const sendStatus = (message, type = 'status') => {
        res.write(`data: {"type": "${type}", "message": ${JSON.stringify(message)}}\n\n`);
    };

    try {
        sendStatus('🔄 מעדכן את דף הנחיתה...');
        
        const stream = await openai.chat.completions.create({
            model: 'o4-mini-2025-04-16',
            stream: true,
            messages: [{ 
                role: 'user', 
                content: `Update the landing page HTML based on this request: ${editRequest}
                Original business context:
                Business name: ${businessId}
                Description: ${description}
                Use only valid HTML with Tailwind CSS classes.
                Return only the full HTML content, no additional explanation.
                Make sure all content remains in Hebrew and RTL aligned.`
            }]
        });

        for await (const chunk of stream) {
            const content = chunk.choices?.[0]?.delta?.content;
            if (content) {
                generatedHTML += content; // Accumulate the HTML
                res.write(`data: {"type": "content", "chunk": ${JSON.stringify(content)}}\n\n`);
            }
        }

        // Create and push to GitHub after generation is complete
        sendStatus('📁 מכין את המאגר ב-GitHub...');

        // Save the generated HTML to a temporary file
        const tempDir = os.tmpdir();
        const tempFilePath = path.join(tempDir, `landingPage_${Date.now()}.html`);
        await fs.writeFile(tempFilePath, generatedHTML, 'utf8');

        // Update the repository
        const repoUrl = await createAndPushRepo(tempFilePath, {
            name: businessId,
            description: description,
            repoName: currentRepoName,
            isUpdate: true
        });

        // Send the repository URL to the client
        res.write(`data: {"type": "repo_url", "url": "${repoUrl}"}\n\n`);
        sendStatus('✨ העדכון הושלם בהצלחה!', 'success');

        // Clean up the temporary file
        await fs.unlink(tempFilePath);

        // Send completion status
        res.write(`data: {"type": "done"}\n\n`);
    } catch (error) {
        console.error('Stream error:', error);
        res.write(`data: {"type": "error", "message": "אירעה שגיאה בעדכון דף הנחיתה"}\n\n`);
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
