const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ORGANIZATION = 'hayotzerai-landingPages';

const octokit = new Octokit({
  auth: GITHUB_TOKEN
});

module.exports.createAndPushRepo = async function(landingPagePath, businessData) {
  const repoName = `landing-${Date.now()}`;
  
  try {
    // Send status update
    this.onStatus?.('Creating new GitHub repository...');
    
    // Create new repository
    const { data: repo } = await octokit.repos.createInOrg({
      org: ORGANIZATION,
      name: repoName,
      description: `Landing page for ${businessData.name}`,
      private: false,
      auto_init: true
    });

    this.onStatus?.('Repository created successfully!');
    
    // Read the HTML content
    const content = await fs.readFile(landingPagePath, 'utf8');
    
    this.onStatus?.('Pushing landing page content...');
    
    // Create index.html file in the repository
    await octokit.repos.createOrUpdateFileContents({
      owner: ORGANIZATION,
      repo: repoName,
      path: 'index.html',
      message: 'Add landing page',
      content: Buffer.from(content).toString('base64')
    });

    this.onStatus?.('Content pushed successfully!');
    
    return repo.html_url;
  } catch (error) {
    this.onStatus?.(`Failed to create repository: ${error.message}`);
    throw error;
  }
}