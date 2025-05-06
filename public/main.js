document.getElementById('generate').addEventListener('click', () => {
  const desc = document.getElementById('description').value;
  const placeId = document.getElementById('placeid').value;
  
  if (!desc || !placeId) {
    alert('Please provide both a description and a Place ID.');
    return;
  }

  // Show split screen and hide main container
  document.getElementById('main-container').style.display = 'none';
  document.getElementById('split-screen').style.display = 'grid';
  document.getElementById('preview').classList.add('active');

  // Update input summary
  document.getElementById('description-summary').textContent = desc;
  document.getElementById('placeid-summary').textContent = placeId;

  // Clear previous content
  document.getElementById('status').innerHTML = '';
  document.getElementById('preview').innerHTML = '';
  document.getElementById('repo-link').style.display = 'none';

  let fullHTML = '';
  const eventSource = new EventSource(`/stream?description=${encodeURIComponent(desc)}&googleId=${encodeURIComponent(placeId)}`);

  eventSource.onmessage = (event) => {
    try {
      if (event.data === '[DONE]') {
        eventSource.close();
        updateStatus('✨ Process completed');
        return;
      }

      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'content':
          fullHTML += data.chunk;
          document.getElementById('preview').innerHTML = fullHTML;
          break;

        case 'status':
          updateStatus(data.message);
          break;

        case 'repo_url':
          const repoLink = document.getElementById('repo-link');
          repoLink.innerHTML = `
            <div class="font-medium mb-2">🎉 Landing Page Repository</div>
            <a href="${data.url}" target="_blank" 
               class="text-blue-500 hover:underline break-all">
              ${data.url}
            </a>
          `;
          repoLink.style.display = 'block';
          break;

        case 'error':
          updateStatus(`❌ Error: ${data.message}`);
          break;
      }
    } catch (err) {
      console.error('Error processing message:', err);
    }
  };

  eventSource.onerror = () => {
    console.error('EventSource failed.');
    eventSource.close();
    updateStatus('❌ Connection failed');
  };
});

function updateStatus(message) {
  const statusEl = document.createElement('div');
  statusEl.className = 'status-message';
  
  const time = new Date().toLocaleTimeString();
  statusEl.innerHTML = `
    <span class="text-gray-500">[${time}]</span>
    <span class="ml-2">${message}</span>
  `;
  
  const statusContainer = document.getElementById('status');
  statusContainer.appendChild(statusEl);
  statusContainer.scrollTop = statusContainer.scrollHeight;
}
