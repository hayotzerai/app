require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const nodemailer = require('nodemailer');

const { createAndPushRepo } = require('./github.js');
const fs = require('fs').promises;
const path = require('path');
const os = require('os'); // Add this to handle temporary directories

const { admin, db, bucket, auth } = require('./config.js');
const upload = require('./middleware/fileUploading.js');

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('public'));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

// Add this helper function at the top
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

///////////////////////
// Add new user schema
const createUser = async (userData) => {
    try {
      const userRef = db.collection('users').doc(userData.id);
      await userRef.set({
        id: userData.id,
        email: userData.email,
        businessName: userData.businessName,
        businessDescription: userData.businessDescription,
        landingPageGoal: userData.landingPageGoal,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return userRef;
    } catch (error) {
      console.error('Error creating user:', error);
      throw error;
    }
  };
  
// Replace the /send-verification route
app.post('/send-verification', async (req, res) => {
    const { email } = req.body;

    try {
        const verificationCode = generateVerificationCode();
        
        // Store the code in Firestore with expiration
        await db.collection('verificationCodes').doc(email).set({
            code: verificationCode,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expires: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000) // 10 minutes
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: 'קוד אימות עבור דף הנחיתה שלך',
            html: `
                <div dir="rtl" style="font-family: Arial, sans-serif;">
                    <h2>קוד האימות שלך</h2>
                    <p>הקוד שלך הוא:</p>
                    <h1 style="font-size: 32px; letter-spacing: 5px; color: #0066cc;">${verificationCode}</h1>
                    <p>הקוד תקף ל-10 דקות בלבד.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);
        res.status(200).json({ message: 'Verification code sent' });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Failed to send verification code' });
    }
});

// Add new verification endpoint
app.post('/verify-code', async (req, res) => {
    const { email, code } = req.body;

    try {
        const codeDoc = await db.collection('verificationCodes').doc(email).get();
        
        if (!codeDoc.exists) {
            return res.status(400).json({ error: 'No verification code found' });
        }

        const codeData = codeDoc.data();
        
        if (codeData.expires.toMillis() < Date.now()) {
            await db.collection('verificationCodes').doc(email).delete();
            return res.status(400).json({ error: 'Verification code expired' });
        }

        if (codeData.code !== code) {
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Create or update user with verified email
        await auth.createUser({
            email: email,
            emailVerified: true
        }).catch(() => {
            // User might already exist, update verification status
            return auth.updateUser(email, { emailVerified: true });
        });

        // Delete the used verification code
        await db.collection('verificationCodes').doc(email).delete();

        res.status(200).json({ message: 'Email verified successfully' });
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

app.post('/register', upload.array('photos', 5), async (req, res) => {
        const { id, email, businessName, businessDescription, landingPageGoal } = req.body;
        const files = req.files;

        try {
            // Generate URLs for uploaded files
            const photoUrls = files.map(file => {
                return `/uploads/${id}/${file.filename}`;
            });

            // Create user in Firestore
            await createUser({
                id,
                email,
                businessName,
                businessDescription,
                landingPageGoal,
                photoUrls
            });

            res.status(200).json({ message: 'User registered successfully' });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ error: 'Registration failed' });
        }
    });
  
// Replace verify-otp with this:
app.post('/verify-email', async (req, res) => {
    const { email } = req.body;

    try {
        const userRecord = await auth.getUserByEmail(email);
        
        if (userRecord.emailVerified) {
            res.status(200).json({ 
                message: 'Email verified successfully',
                verified: true 
            });
        } else {
            res.status(200).json({ 
                message: 'Email not verified yet',
                verified: false 
            });
        }
    } catch (error) {
        console.error('Verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});
///////////////////////



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
