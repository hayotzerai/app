const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');
const serviceAccount = require('./hayotzerai-807bf-firebase-adminsdk-fbsvc-a683eec3d9.json');
const path = require('path');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const auth = getAuth();
const uploadsDir = path.join(__dirname, 'public', 'uploads');

module.exports = { admin, db, auth, uploadsDir };