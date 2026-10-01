const admin = require('firebase-admin');
const sa = require('./firebase-admin.json');
const app = admin.initializeApp({ credential: admin.credential.cert(sa) });

async function updateRules() {
  const tokenObj = await app.options.credential.getAccessToken();
  const token = tokenObj.access_token;
  
  const rulesContent = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /waitlist/{document} {
      allow create: if request.resource.data.keys().hasAll(['contact', 'feature', 'timestamp'])
                    && request.resource.data.contact is string
                    && request.resource.data.contact.size() > 0
                    && request.resource.data.contact.size() <= 25
                    && request.resource.data.feature is string
                    && request.resource.data.feature.size() <= 100;
      allow read: if request.auth != null && request.auth.token.email == 'djeble.haniel@gmail.com';
      allow update, delete: if false;
    }

    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}`;

  console.log('Creating new ruleset...');
  const createRes = await fetch('https://firebaserules.googleapis.com/v1/projects/resumeci-d5c9a/rulesets', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      source: {
        files: [{
          name: 'firestore.rules',
          content: rulesContent
        }]
      }
    })
  });
  const ruleset = await createRes.json();
  console.log('New ruleset response:', ruleset);
  
  if (!ruleset.name) {
    console.error('Failed to create ruleset');
    return;
  }
  
  console.log('Releasing new ruleset for cloud.firestore...');
  const releaseRes = await fetch('https://firebaserules.googleapis.com/v1/projects/resumeci-d5c9a/releases/cloud.firestore', {
    method: 'PATCH',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      release: {
        name: 'projects/resumeci-d5c9a/releases/cloud.firestore',
        rulesetName: ruleset.name
      }
    })
  });
  const release = await releaseRes.json();
  console.log('Release response:', release);
}

updateRules().catch(console.error);
