# OAuth Configuration Guide for Supabase

## Overview
This guide will help you configure Google, Facebook, and GitHub OAuth providers in your Supabase project.

## Prerequisites
- Supabase project created and running
- Access to your Supabase dashboard
- Developer accounts with Google, Facebook, and GitHub

---

## 1. GOOGLE OAUTH SETUP

### Step 1: Create Google OAuth Application
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" > "OAuth 2.0 Client IDs"
5. Configure the consent screen if prompted
6. Set Application type to "Web application"
7. Add authorized redirect URIs:
   ```
   https://[YOUR-SUPABASE-PROJECT-ID].supabase.co/auth/v1/callback
   ```
8. Save and copy the Client ID and Client Secret

### Step 2: Configure in Supabase
1. Go to your Supabase dashboard
2. Navigate to Authentication > Providers
3. Find Google and click "Enable"
4. Enter your Google Client ID and Client Secret
5. Save the configuration

---

## 2. FACEBOOK OAUTH SETUP

### Step 1: Create Facebook App
1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "Create App" > "Consumer" > "Next"
3. Enter app name and contact email
4. Go to "Add Product" and select "Facebook Login"
5. In Facebook Login settings, add redirect URI:
   ```
   https://[YOUR-SUPABASE-PROJECT-ID].supabase.co/auth/v1/callback
   ```
6. Copy App ID and App Secret from Settings > Basic

### Step 2: Configure in Supabase
1. In Supabase dashboard, go to Authentication > Providers
2. Find Facebook and click "Enable"
3. Enter your Facebook App ID and App Secret
4. Save the configuration

---

## 3. GITHUB OAUTH SETUP

### Step 1: Create GitHub OAuth App
1. Go to GitHub Settings > Developer settings > OAuth Apps
2. Click "New OAuth App"
3. Fill in application details:
   - Application name: "Barter App"
   - Homepage URL: Your app URL
   - Authorization callback URL:
     ```
     https://[YOUR-SUPABASE-PROJECT-ID].supabase.co/auth/v1/callback
     ```
4. Register application and copy Client ID and Client Secret

### Step 2: Configure in Supabase
1. In Supabase dashboard, go to Authentication > Providers
2. Find GitHub and click "Enable"
3. Enter your GitHub Client ID and Client Secret
4. Save the configuration

---

## 4. TESTING OAUTH CONFIGURATION

After configuring all providers:

1. Test each provider individually
2. Check that user data is properly stored in your users table
3. Verify that the auth state is correctly managed in your app

---

## 5. TROUBLESHOOTING

### Common Issues:
- **Redirect URI mismatch**: Ensure the callback URL exactly matches what's configured
- **App not verified**: Some providers require app verification for production use
- **CORS issues**: Make sure your domain is added to allowed origins in Supabase

### Testing Checklist:
- [ ] Google OAuth working
- [ ] Facebook OAuth working  
- [ ] GitHub OAuth working
- [ ] User profiles created correctly
- [ ] No console errors during auth flow

---

## 6. SECURITY CONSIDERATIONS

- Keep your OAuth secrets secure and never commit them to version control
- Use environment variables for sensitive configuration
- Regularly rotate OAuth secrets
- Monitor authentication logs for suspicious activity

---

## Next Steps

Once OAuth is configured:
1. Test all social login flows
2. Verify user data persistence
3. Move to Phase 2 implementation