require('dotenv').config();
const express = require('express');
const { OpenAI } = require('openai');
const { scrapeBusinessReviews } = require('./scraper.js');
const { createAndPushRepo } = require('./github.js');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const port = 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.static('public'));

// Helper function to fetch reviews using scrapeBusinessReviews
async function fetchReviews(googleId) {
    try {
        const reviews = await scrapeBusinessReviews(googleId);
        return reviews; // Will return empty array if no reviews found
    } catch (error) {
        console.error('Error fetching reviews:', error);
        return []; // Return empty array on error
    }
}

app.get('/stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const userDescription = req.query.description;
  const googleId = req.query.googleId;
  const businessName = req.query.businessName || 'Business';

  const sendStatus = (message, type = 'status') => {
    res.write(`data: {"type": "${type}", "message": ${JSON.stringify(message)}}\n\n`);
  };

  try {
    sendStatus('🚀 Starting the landing page generation process...');
    
    const reviews = await fetchReviews(googleId);
    sendStatus(`📊 ${reviews.length ? `Found ${reviews.length} reviews` : 'No reviews found'}`);
    
    const prompt = `
    You are an expert landing page copywriter. Based on the provided diagram and business description, generate concise, high-converting copy for each section of a landing page. Exclude irrelevant sections (e.g., fixed pricing for service-based businesses).
    
    **Inputs:**
    1. **Business Description:** \`${userDescription}\`
    2. **Google Reviews:** \`${JSON.stringify(reviews)}\`
    
    **Sections to generate:**
    1. **Navbar:** Generate placeholder links and a clear CTA label.
    2. **Hero/Main Fold:**
        * **Heading:** Write a benefit-driven headline.
        * **Subheading:** Explain the offer and benefits.
        * **CTA:** Write an action-oriented CTA.
        * **Video (Placeholder):** Mention placeholder, no script.
    3. **Social Proof:** Use Google reviews as testimonials.
    4. **Comparison (Optional):** If relevant, contrast old way vs. business solution. Otherwise, skip.
    5. **Benefits:** List 3-5 key benefits in short, punchy points.
    6. **How it Works? (Optional):** If applicable, outline 3-5 steps. Otherwise, skip.
    7. **Pricing (Optional):** Only if fixed pricing is mentioned. Otherwise, state "Pricing omitted."
    8. **FAQ:** List 3-5 common questions and answers.
    9. **Bottom CTA:** Reinforce primary CTA.
    10. **Footer:** Placeholder content for copyright, privacy policy, contact info, and social links.
    11. the audiance is hebrew native speakers, so the text should be in Hebrew.
    12. the website should be aligned to the right.(right ot left).
    13. embded  a link to the youtube video to the hero section : https://www.youtube.com/watch?v=2ROWVHrcyaI

    **Output:** 
    Return valid HTML with TailwindCSS classes. No explanations.`;

    sendStatus('✍️ Generating landing page content...');
    let generatedHTML = '';

    const stream = await openai.chat.completions.create({
      model: 'o4-mini-2025-04-16',
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const chunk of stream) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        generatedHTML += content;
        // Send content chunks for live preview
        res.write(`data: {"type": "content", "chunk": ${JSON.stringify(content)}}\n\n`);
      }
    }

    sendStatus('✨ Landing page generation complete!');
    sendStatus('📁 Preparing to create GitHub repository...');

    try {
      const tempDir = path.join(__dirname, 'temp', `landing-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      const filePath = path.join(tempDir, 'index.html');
      await fs.writeFile(filePath, generatedHTML);

      const businessData = {
        name: businessName,
        description: userDescription
      };

      // Create GitHub repository and get URL
      const repoUrl = await createAndPushRepo(filePath, businessData);
      
      // Send repository URL to client
      res.write(`data: {"type": "repo_url", "url": "${repoUrl}"}\n\n`);
      sendStatus('🎉 Repository created successfully!');

      // Clean up
      await fs.rm(tempDir, { recursive: true, force: true });
      sendStatus('🧹 Temporary files cleaned up');
    } catch (githubError) {
      console.error('GitHub integration error:', githubError);
      sendStatus('❌ Failed to create GitHub repository', 'error');
    }

    res.write('data: [DONE]\n\n');
  } catch (err) {
    console.error(err);
    sendStatus('❌ An error occurred', 'error');
  } finally {
    res.end();
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
