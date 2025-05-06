let currentStep = 'phone';
let verifiedPhone = '';

function showStep(stepId) {
    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
    document.getElementById(`step-${stepId}`).classList.add('active');
}

async function verifyPhone() {
    const phone = document.getElementById('phone').value;
    if (!phone) {
        alert('נא להזין מספר טלפון');
        return;
    }

    try {
        const response = await fetch('/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone })
        });

        if (response.ok) {
            verifiedPhone = phone;
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
            body: JSON.stringify({ phone: verifiedPhone, otp })
        });

        if (response.ok) {
            showStep('business');
        } else {
            alert('קוד שגוי');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('שגיאה באימות הקוד');
    }
}

async function generateLanding() {
    const businessId = document.getElementById('business-id').value;
    const businessUnique = document.getElementById('business-unique').value;

    if (!businessId || !businessUnique) {
        alert('נא למלא את כל השדות');
        return;
    }

    // Show split screen and hide main container
    document.getElementById('main-container').style.display = 'none';
    document.getElementById('split-screen').style.display = 'grid';
    document.getElementById('preview').classList.add('active');

    // Update input summary
    document.getElementById('business-summary').textContent = businessId;
    document.getElementById('description-summary').textContent = businessUnique;

    // Start SSE connection
    const eventSource = new EventSource(`/stream?businessId=${encodeURIComponent(businessId)}&description=${encodeURIComponent(businessUnique)}`);

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
}

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
