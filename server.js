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
            photoNames: userData.photoNames, // Save photo names
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

    // Validate required fields
    if (!id || !email || !businessName || !businessDescription || !landingPageGoal) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    console.log('Request Body:', req.body);
    console.log('Uploaded Files:', files);

    try {
        // Extract photo names
        const photoNames = files.map(file => file.filename);

        console.log('Photo Names:', photoNames);

        // Create user in Firestore
        await createUser({
            id,
            email,
            businessName,
            businessDescription,
            landingPageGoal,
            photoNames // Save photo names in Firestore
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



app.post('/stream', async (req, res) => {
    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
  
    // Destructure exactly what you sent
    const {
      businessName = 'Business',
      businessUnique: businessId,
      landingGoal,
      businessDescription,
      photosPath = []
    } = req.body;
  
    let generatedHTML = '';
  
    const sendStatus = (message, type = 'status') => {
      res.write(`data: ${JSON.stringify({ type, message })}\n\n`);
    };
  
    try {
      sendStatus('🚀 מתחיל בתהליך יצירת דף הנחיתה…');
  
      // Build your user message, injecting the photosPath array
      const userPrompt = `
  Create a high-conversion landing page in Hebrew for: ${businessDescription}.
  Business name: ${businessName}.
  Business ID: ${businessId}.
  Use these photos paths: ${photosPath.join(', ')}.
  The landing page's goal is: ${landingGoal}.
  — Use only valid HTML with Tailwind CSS classes.
  — RTL Hebrew layout optimized for Israeli audiences.
  Return only the full HTML content, no extra explanation.
  `;
  
      const stream = await openai.chat.completions.create({
        model: 'o4-mini-2025-04-16',
        stream: true,
        messages: [{ role: 'user', content: userPrompt }]
      });
  
      // Stream the chunks
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) {
          generatedHTML += content;
          res.write(`data: ${JSON.stringify({ type: 'content', chunk: content })}\n\n`);
        }
      }
  
      // Once done, push to GitHub…
      sendStatus('📁 מכין את המאגר ב‑GitHub…');
  
      const tempFile = path.join(os.tmpdir(), `landing_${Date.now()}.html`);
      await fs.writeFile(tempFile, generatedHTML, 'utf8');
      const repoUrl = await createAndPushRepo(tempFile, {
        name: businessId,
        description: businessDescription
      });
  
      res.write(`data: ${JSON.stringify({ type: 'repo_url', url: repoUrl })}\n\n`);
      sendStatus('🎉 המאגר נוצר בהצלחה!', 'success');
      await fs.unlink(tempFile);
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      
    } catch (err) {
      console.error(err);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'אירעה שגיאה ביצירת דף הנחיתה' })}\n\n`);
    }
  });


app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
