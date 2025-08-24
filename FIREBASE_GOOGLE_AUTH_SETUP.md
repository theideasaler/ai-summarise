# Firebase Google Authentication Setup Guide

## Issue: "Operation Not Allowed" Error

If you're encountering the `auth/operation-not-allowed` error when trying to sign in with Google, it means that Google sign-in provider is not enabled in your Firebase project console.

## Solution: Enable Google Sign-In Provider

### Step 1: Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: `ai-summarise-be`

### Step 2: Navigate to Authentication
1. In the left sidebar, click on **Authentication**
2. Click on the **Sign-in method** tab

### Step 3: Enable Google Provider
1. Find **Google** in the list of sign-in providers
2. Click on **Google** to configure it
3. Toggle the **Enable** switch to ON
4. Configure the following:
   - **Project support email**: Enter a valid email address (required)
   - **Project public-facing name**: Enter "AI Summarise" or your preferred app name

### Step 4: Configure OAuth Settings
1. The **Web SDK configuration** should auto-populate with:
   - Web client ID
   - Web client secret
2. If not auto-populated, you can find these in [Google Cloud Console](https://console.cloud.google.com/)
   - Go to APIs & Services > Credentials
   - Look for OAuth 2.0 Client IDs

### Step 5: Save Configuration
1. Click **Save** to enable Google sign-in
2. The provider should now show as "Enabled" in the list

## Verification

After enabling Google sign-in:
1. Try signing in with Google in your application
2. The error should be resolved
3. Users should be able to authenticate successfully

## Additional Configuration (Optional)

### Authorized Domains
Make sure your domain is listed in the **Authorized domains** section:
- `localhost` (for development)
- Your production domain (when deployed)

### OAuth Consent Screen
If you haven't configured the OAuth consent screen in Google Cloud Console:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to APIs & Services > OAuth consent screen
3. Configure the consent screen with your app information

## Current Firebase Configuration

Your current Firebase config in the Angular app:
```typescript
firebase: {
  apiKey: 'AIzaSyBNJN8l0xiiCxYGrcPVyPEf6y-XZl_MThY',
  authDomain: 'ai-summarise-be.firebaseapp.com',
  projectId: 'ai-summarise-be',
  storageBucket: 'ai-summarise-be.firebasestorage.app',
  messagingSenderId: '437396741747',
  appId: '1:437396741747:web:2cb8f140def4dd68851406',
  measurementId: 'G-BZG6J92R1L',
}
```

## Troubleshooting

If you still encounter issues after enabling Google sign-in:

1. **Clear browser cache and cookies**
2. **Check browser console** for additional error details
3. **Verify OAuth consent screen** is properly configured
4. **Check authorized domains** include your current domain
5. **Ensure Firebase project** is linked to the correct Google Cloud project

## Error Handling Improvements

The application now includes better error handling for this specific case:
- Login component shows: "Google sign-in is not enabled. Please contact support or try email sign-in"
- Signup component shows: "Google sign-up is not enabled. Please contact support or try email sign-up"

This provides users with clear guidance when the Google provider is not properly configured.