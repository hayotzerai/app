let currentStep = 'email';
let verifiedEmail = '';
let currentRepoName = ''; // Store the current repository name
let formData = new FormData();
let currentBusinessId = '';

function showStep(stepId) {
    // Hide all steps
    document.querySelectorAll('.form-step').forEach(step => {
        if (!step.classList.contains('hidden')) {
            step.classList.add('hidden'); // Add 'hidden' class only if it doesn't already exist
        }
    });

    // Show the requested step
    setTimeout(() => {
        console.log('Showing step:', stepId); // Debug logging
        document.getElementById(stepId).classList.remove('hidden'); // Remove 'hidden' class to show
        updateProgressBar(stepId); // Update progress bar
    }, 1000);
}

function updateProgressBar(stepId) {
    const steps = ['step-email', 'step-otp', 'step-business-id', 'step-business', 'step-uploads'];
    const currentStepIndex = steps.indexOf(stepId);
    const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100;

    const progressBar = document.getElementById('progress-bar');
    progressBar.style.width = `${progressPercentage}%`;
}

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
            console.log('Verification code sent successfully');
            showStep('step-otp'); // Use the correct step ID
        } else {
            const errorData = await response.json();
            const errorMessage = errorData.error || 'Failed to send verification code';
            alert(`שגיאה בשליחת קוד האימות: ${errorMessage}`);
            console.error('Error sending verification code:', errorMessage);
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

            showStep('step-business-id'); // Use the correct step ID
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

function verifyBusinessId() {
    const businessRegistration = document.getElementById('business-registration').value;
    currentBusinessId = businessRegistration; // Store the ID for later use
    
    if (!/^\d{9}$/.test(businessRegistration)) {
        alert('מספר ח״פ/עוסק מורשה חייב להכיל 9 ספרות בדיוק');
        return;
    }
    
    showStep('step-business'); // Use the correct step ID
}

function handleBusinessDetails() {
    const businessName = document.getElementById('business-id').value;
    const businessUnique = document.getElementById('business-unique').value;

    if (!businessName || !businessUnique) {
        alert('נא למלא את כל השדות');
        return;
    }

    formData.append('businessName', businessName);
    formData.append('businessDescription', businessUnique);
    showStep('step-uploads'); // Use the correct step ID
}
let b_id = '';
let b_name = '';
let b_description = '';
let b_landingGoal = '';
let b_photos = [];

async function submitRegistration() {
    const photos = document.getElementById('business-photos').files;
    const landingGoal = document.getElementById('landing-goal-type').value;
    const businessName = document.getElementById('business-id').value; // Ensure this field exists
    const businessDescription = document.getElementById('business-unique').value;

    if (photos.length === 0 || !landingGoal || !businessName || !businessDescription) {
        alert('נא למלא את כל השדות ולהעלות לפחות תמונה אחת');
        return;
    }

    // Add all data to FormData
    formData.append('id', currentBusinessId);
    b_id = currentBusinessId;
    formData.append('email', verifiedEmail);
    formData.append('businessName', businessName); // Add businessName
    b_name = businessName;
    formData.append('businessDescription', businessDescription); // Add businessDescription
    b_description = businessDescription;
    formData.append('landingPageGoal', landingGoal);
    b_landingGoal = landingGoal;

    // Add photos
    for (const photo of photos) {
        formData.append('photos', photo);
        b_photos.push(`uploads/${currentBusinessId}/${currentBusinessId}_${photo.name}`);

    }

    console.log('FormData:', Array.from(formData.entries()));

    try {
        const response = await fetch('/register', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            console.log('Registration successful. Starting landing page generation...');
            generateLanding(); // Start landing page generation after successful registration
        } else {
            throw new Error('Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('שגיאה בתהליך ההרשמה');
    }
}

async function generateLanding() {
    const businessName = b_name;
    const businessUnique = b_id;
    const landingGoal = b_landingGoal;
    const businessDescription = b_description;

    // DOM Elements
    const splitScreen = document.getElementById('split-screen');
    const statusEl = document.getElementById('status');
    const output = document.getElementById('preview');
    const repoLink = document.getElementById('repo-link');
    const businessNameDisplay = document.getElementById('business-name');
    const businessRegistrationDisplay = document.getElementById('business-registration-display');
    const descriptionSummary = document.getElementById('description-summary');

    if (!businessName || !businessUnique) {
        alert('נא למלא את כל השדות');
        return;
    }

    // Show the split screen UI
    splitScreen.classList.remove('hidden');

    // Fill in business info summary
    businessNameDisplay.textContent = businessName;
    businessRegistrationDisplay.textContent = businessUnique;
    descriptionSummary.textContent = businessDescription;

    // Reset UI elements
    statusEl.textContent = '⏳ מתחיל ביצירת הדף...';
    output.innerHTML = '';
    output.classList.remove('hidden');
    repoLink.classList.add('hidden');

    let fullHtml = '';

    try {
        const response = await fetch('/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              businessName,
              businessUnique,
              landingGoal,
              businessDescription,
              photosPath: b_photos
            })
          });
        
        
        if (!response.ok) throw new Error('Failed to generate landing page');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n\n');
            buffer = lines.pop(); // Keep the last partial line for the next chunk

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const json = JSON.parse(line.slice(6));
                    handleStreamMessage(json);
                }
            }
        }
    } catch (error) {
        console.error('Error generating landing page:', error);
        statusEl.textContent = '❌ שגיאה ביצירת דף הנחיתה';
    }

    function handleStreamMessage(data) {
        if (data.type === 'status') {
            statusEl.textContent = data.message;
        } else if (data.type === 'content') {
            fullHtml += data.chunk;
            output.innerHTML = fullHtml;
        } else if (data.type === 'repo_url') {
            repoLink.classList.remove('hidden');
            repoLink.innerHTML = `<a href="${data.url}" target="_blank" class="text-blue-600 underline">🔗 לצפייה במאגר GitHub</a>`;
        } else if (data.type === 'success') {
            statusEl.textContent = data.message;
        } else if (data.type === 'error') {
            statusEl.textContent = `❌ ${data.message}`;
        }
    }
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

function validateFiles(input) {
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const allowedFileTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const files = input.files;

    for (const file of files) {
        if (!allowedFileTypes.includes(file.type)) {
            alert(`סוג הקובץ ${file.name} אינו נתמך. ניתן להעלות רק קבצים מסוג JPG, PNG, או WEBP.`);
            input.value = ''; // Clear the input
            return;
        }

        if (file.size > maxFileSize) {
            alert(`הקובץ ${file.name} גדול מדי. ניתן להעלות קבצים בגודל של עד 10MB בלבד.`);
            input.value = ''; // Clear the input
            return;
        }
    }

    alert('הקבצים נבדקו בהצלחה!');
}
