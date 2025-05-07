const { Octokit } = require('@octokit/rest');
const fs = require('fs').promises;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ORGANIZATION = 'hayotzerai-landingPages';

const octokit = new Octokit({
  auth: GITHUB_TOKEN
});

module.exports.createAndPushRepo = async function(content, businessData) {
  const repoName = businessData.isUpdate ? businessData.repoName : `landing-${Date.now()}`;
  
  try {
    if (!businessData.isUpdate) {
      this.onStatus?.('Creating new GitHub repository...');
      
      const { data: repo } = await octokit.repos.createInOrg({
        org: ORGANIZATION,
        name: repoName,
        description: `Landing page for ${businessData.name}`,
        private: false,
        auto_init: true
      });

      this.onStatus?.('Repository created successfully!');
    }

    this.onStatus?.('Pushing landing page content...');
    
    await octokit.repos.createOrUpdateFileContents({
      owner: ORGANIZATION,
      repo: repoName,
      path: 'index.html',
      message: businessData.isUpdate ? 'Update landing page content' : 'Add landing page',
      content: Buffer.from(content).toString('base64'),
      ...(businessData.isUpdate && {
        sha: await getFileSha(repoName, 'index.html')
      })
    });

    this.onStatus?.('Content pushed successfully!');
    
    return `https://github.com/${ORGANIZATION}/${repoName}`;
  } catch (error) {
    this.onStatus?.(`Failed to create repository: ${error.message}`);
    throw error;
  }
};

async function getFileSha(repo, path) {
  const { data } = await octokit.repos.getContent({
    owner: ORGANIZATION,
    repo: repo,
    path: path
  });
  return data.sha;
}