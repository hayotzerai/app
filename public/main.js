let currentStep = 'email';
let verifiedEmail = '';
let currentRepoName = ''; // Store the current repository name

function showStep(stepId) {
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step-${stepId}`).classList.add('active');
}

async function verifyEmail() {
    const email = document.getElementById('email').value;
    if (!email) {
        alert('נא להזין כתובת אימייל');
        return;
    }

    try {
        const response = await fetch('/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        if (response.ok) {
            verifiedEmail = email;
            showStep('otp');
        } else {
            alert('שגיאה בשליחת קוד האימות');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('שגיאה בשליחת קוד האימות');
    }
}

async function verifyOTP() {
    const otp = document.getElementById('otp').value;
    if (!otp) {
        alert('נא להזין את הקוד שקיבלת');
        return;
    }

    try {
        const response = await fetch('/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: verifiedEmail, otp })
        });

        if (response.ok) {
            showStep('business-id'); // Changed to show business-id step first
        } else {
            alert('קוד שגוי');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('שגיאה באימות הקוד');
    }
}

// Add new function to verify business registration number
function verifyBusinessId() {
    const businessRegistration = document.getElementById('business-registration').value;
    
    // Validate format (9 digits)
    if (!/^\d{9}$/.test(businessRegistration)) {
        alert('מספר ח״פ/עוסק מורשה חייב להכיל 9 ספרות בדיוק');
        return;
    }

    // Here you could add additional validation or API call to verify the number
    // For now, we'll just proceed to the next step
    showStep('business');
}

async function generateLanding() {
    const businessRegistration = document.getElementById('business-registration').value;
    const businessId = document.getElementById('business-id').value;
    const businessUnique = document.getElementById('business-unique').value;

    if (!businessRegistration || !businessId || !businessUnique) {
        alert('נא למלא את כל השדות');
        return;
    }

    // Show split screen and hide main container
    document.getElementById('main-container').style.display = 'none';
    document.getElementById('split-screen').style.display = 'grid';
    document.getElementById('preview').classList.add('active');

    // Update input summary to include business registration
    document.getElementById('business-name').textContent = businessId;
    document.getElementById('business-registration-display').textContent = businessRegistration;
    document.getElementById('description-summary').textContent = businessUnique;

    let fullHTML = '';
    let isCollectingHTML = false;

    // Start SSE connection
    const eventSource = new EventSource(`/stream?businessId=${encodeURIComponent(businessId)}&description=${encodeURIComponent(businessUnique)}`);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'content':
                    const content = data.chunk;
                    console.log('Received content:', content); // Debug logging
                    
                    // Clean the content and update HTML
                    if (content.includes('```html')) {
                        isCollectingHTML = true;
                        fullHTML += content.replace('```html', '');
                    } else if (content.includes('```')) {
                        isCollectingHTML = false;
                        fullHTML += content.replace('```', '');
                    } else {
                        fullHTML += content;
                    }
                    
                    // Update preview with accumulated HTML
                    const preview = document.getElementById('preview');
                    preview.innerHTML = fullHTML;
                    preview.style.direction = 'rtl';
                    break;

                case 'repo_url':
                    currentRepoName = data.repoName; // Store the repo name
                    // Display the repository URL in the sidebar
                    const repoLink = document.getElementById('repo-link');
                    repoLink.innerHTML = `
                        <div class="mt-4 p-4 bg-blue-50 rounded-lg">
                            <h3 class="text-lg font-semibold mb-2">🎉 האתר שלך מוכן!</h3>
                            <p class="text-sm mb-2">לחץ על הקישור כדי לצפות באתר:</p>
                            <a href="${data.url}" 
                               target="_blank" 
                               class="text-blue-500 hover:text-blue-700 underline break-all">
                                ${data.url}
                            </a>
                        </div>
                    `;
                    repoLink.style.display = 'block';
                    showEditInterface(); // Show edit interface after initial generation
                    break;

                case 'status':
                    updateStatus(data.message);
                    break;

                case 'done':
                    eventSource.close();
                    updateStatus('✨ התהליך הושלם בהצלחה');
                    break;

                case 'error':
                    updateStatus(`❌ שגיאה: ${data.message}`);
                    eventSource.close();
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    };

    eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        eventSource.close();
        updateStatus('❌ החיבור נכשל');
    };
}

function updateStatus(message) {
    const statusEl = document.createElement('div');
    statusEl.className = 'status-message';
    
    const time = new Date().toLocaleTimeString('he-IL');
    statusEl.innerHTML = `
        <span class="text-gray-500">[${time}]</span>
        <span class="mr-2">${message}</span>
    `;
    
    const statusContainer = document.getElementById('status');
    statusContainer.appendChild(statusEl);
    statusContainer.scrollTop = statusContainer.scrollHeight;
}

// Show edit interface after initial generation
function showEditInterface() {
    document.getElementById('edit-interface').style.display = 'block';
}

async function updateLandingPage() {
    const editRequest = document.getElementById('edit-request').value;
    if (!editRequest) {
        alert('נא להזין את השינויים המבוקשים');
        return;
    }

    const request = {
        businessId: document.getElementById('business-name').textContent,
        description: document.getElementById('description-summary').textContent,
        editRequest: editRequest,
        currentRepoName: currentRepoName
    };

    // Start SSE connection for the update
    const eventSource = new EventSource(`/update-stream?${new URLSearchParams(request)}`);

    // Clear previous edit request
    document.getElementById('edit-request').value = '';
    
    let fullHTML = '';
    let isCollectingHTML = false;

    updateStatus('🔄 מעדכן את דף הנחיתה...');

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'content':
                    const content = data.chunk;
                    console.log('Received update content:', content); // Debug logging
                    
                    // Clean the content and update HTML
                    if (content.includes('```html')) {
                        isCollectingHTML = true;
                        fullHTML += content.replace('```html', '');
                    } else if (content.includes('```')) {
                        isCollectingHTML = false;
                        fullHTML += content.replace('```', '');
                    } else {
                        fullHTML += content;
                    }
                    
                    // Update preview with accumulated HTML
                    const preview = document.getElementById('preview');
                    preview.innerHTML = fullHTML;
                    preview.style.direction = 'rtl';
                    break;

                case 'repo_url':
                    // Update the repository URL in the sidebar
                    const repoLink = document.getElementById('repo-link');
                    repoLink.innerHTML = `
                        <div class="mt-4 p-4 bg-blue-50 rounded-lg">
                            <h3 class="text-lg font-semibold mb-2">🎉 האתר עודכן בהצלחה!</h3>
                            <p class="text-sm mb-2">לחץ על הקישור כדי לצפות באתר המעודכן:</p>
                            <a href="${data.url}" 
                               target="_blank" 
                               class="text-blue-500 hover:text-blue-700 underline break-all">
                                ${data.url}
                            </a>
                        </div>
                    `;
                    repoLink.style.display = 'block';
                    break;

                case 'status':
                    updateStatus(data.message);
                    break;

                case 'done':
                    eventSource.close();
                    break;

                case 'error':
                    updateStatus(`❌ שגיאה: ${data.message}`);
                    eventSource.close();
                    break;
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    };

    eventSource.onerror = (error) => {
        console.error('EventSource failed:', error);
        eventSource.close();
        updateStatus('❌ החיבור נכשל');
    };
}
