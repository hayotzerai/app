let currentStep = 'email';
let verifiedEmail = '';
let currentRepoName = ''; // Store the current repository name
let formData = new FormData();
let currentBusinessId = '';

function showStep(stepId) {
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step-${stepId}`).classList.add('active');
}

// Update the verifyEmail function:
async function verifyEmail() {
    const email = document.getElementById('email').value;
    if (!email) {
        alert('נא להזין כתובת אימייל');
        return;
    }

    try {
        const response = await fetch('/send-verification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        if (response.ok) {
            alert('קוד אימות נשלח לכתובת האימייל שלך');
            showStep('otp');
        } else {
            throw new Error('Failed to send verification code');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('שגיאה בשליחת קוד האימות');
    }
}

async function verifyOTP() {
    const email = document.getElementById('email').value;
    const code = document.getElementById('otp').value;

    if (!code) {
        alert('נא להזין את קוד האימות');
        return;
    }

    try {
        const response = await fetch('/verify-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, code })
        });

        const data = await response.json();

        if (response.ok) {
            verifiedEmail = email;
            showStep('business-id');
        } else {
            alert(data.error === 'Verification code expired' ? 
                  'קוד האימות פג תוקף. אנא בקש קוד חדש' : 
                  'קוד אימות שגוי. אנא נסה שוב');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('שגיאה באימות הקוד');
    }
}

// Remove verifyOTP function as it's no longer needed

// Add this new function for file validation
function validateFiles(input) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    const maxFiles = 5;
    
    if (input.files.length > maxFiles) {
        alert(`ניתן להעלות עד ${maxFiles} תמונות בלבד`);
        input.value = '';
        return false;
    }
    
    for (const file of input.files) {
        if (file.size > maxSize) {
            alert(`הקובץ ${file.name} גדול מ-10MB`);
            input.value = '';
            return false;
        }
        if (!file.type.startsWith('image/')) {
            alert(`הקובץ ${file.name} אינו תמונה`);
            input.value = '';
            return false;
        }
    }
    return true;
}

// Modify verifyBusinessId function
function verifyBusinessId() {
    const businessRegistration = document.getElementById('business-registration').value;
    currentBusinessId = businessRegistration; // Store the ID for later use
    
    if (!/^\d{9}$/.test(businessRegistration)) {
        alert('מספר ח״פ/עוסק מורשה חייב להכיל 9 ספרות בדיוק');
        return;
    }
    
    showStep('business');
}

// Modify the business details step handler
function handleBusinessDetails() {
    const businessName = document.getElementById('business-id').value;
    const businessUnique = document.getElementById('business-unique').value;

    if (!businessName || !businessUnique) {
        alert('נא למלא את כל השדות');
        return;
    }

    formData.append('businessName', businessName);
    formData.append('businessDescription', businessUnique);
    showStep('uploads');
}

// Add new registration submission function
async function submitRegistration() {
    const photos = document.getElementById('business-photos').files;
    const landingGoal = document.getElementById('landing-goal').value;

    if (photos.length === 0 || !landingGoal) {
        alert('נא להעלות לפחות תמונה אחת ולמלא את מטרת דף הנחיתה');
        return;
    }

    // Add all data to FormData
    formData.append('id', currentBusinessId);
    formData.append('email', verifiedEmail);
    formData.append('landingPageGoal', landingGoal);
    
    // Add photos
    for (const photo of photos) {
        formData.append('photos', photo);
    }

    try {
        const response = await fetch('/register', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            // Start the landing page generation process
            generateLanding();
        } else {
            throw new Error('Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('שגיאה בתהליך ההרשמה');
    }
}

// Modify generateLanding function to use stored data
async function generateLanding() {
    // Show split screen and hide main container
    document.getElementById('main-container').style.display = 'none';
    document.getElementById('split-screen').style.display = 'grid';
    document.getElementById('preview').classList.add('active');

    // Update input summary
    document.getElementById('business-name').textContent = formData.get('businessName');
    document.getElementById('business-registration-display').textContent = currentBusinessId;
    document.getElementById('description-summary').textContent = formData.get('businessDescription');

    let fullHTML = '';
    let isCollectingHTML = false;

    // Start SSE connection
    const eventSource = new EventSource(`/stream?businessId=${encodeURIComponent(formData.get('businessName'))}&description=${encodeURIComponent(formData.get('businessDescription'))}`);

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
