# Conversor de Audio - Render.com Deployment Guide

## Overview

This guide will help you deploy the Conversor de Audio web application to Render.com.

## Prerequisites

- GitHub account with the repository
- Render.com account (free tier works)
- Node.js 18+ installed locally for testing

## Step 1: Prepare Your GitHub Repository

### 1.1 Initialize Git (if not already done)

```bash
cd "conversor de audio web"
git init
git add .
git commit -m "Initial commit: Conversor de Audio web application"
```

### 1.2 Add to GitHub

- Create a new repository on GitHub (https://github.com/new)
- Name: `conversor-de-audio` (or your preferred name)
- Add the remote and push:

```bash
git remote add origin https://github.com/YOUR_USERNAME/conversor-de-audio.git
git branch -M main
git push -u origin main
```

## Step 2: Configure Render.com Deployment

### 2.1 Create a New Web Service on Render

1. Go to https://dashboard.render.com
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Select `conversor-de-audio` repository

### 2.2 Configure the Service

Fill in the following settings:

| Setting           | Value                                   |
| ----------------- | --------------------------------------- |
| **Name**          | `conversor-de-audio-web`                |
| **Environment**   | `Node`                                  |
| **Build Command** | `npm install`                           |
| **Start Command** | `npm run start:web`                     |
| **Plan**          | Free tier (or paid based on your needs) |

### 2.3 Add Environment Variables

Click on **Environment** tab and add:

- `NODE_ENV` = `production`
- `PORT` = `3001` (will be automatically assigned by Render, but good to specify)

### 2.4 Deploy

1. Click **Create Web Service**
2. Render will automatically start the deployment
3. Monitor the deploy logs in the dashboard

## Step 3: Verify Deployment

### 3.1 Check Service Status

- Go to your service dashboard on Render
- Wait for status to show **Live**
- Your URL will be displayed: `https://conversor-de-audio-web.onrender.com`

### 3.2 Test the API

```bash
# Health check endpoint
curl https://your-service-url/api/health

# Response should be:
# {"status":"ok"}
```

### 3.3 Access the Web Interface

Open your browser to: `https://your-service-url/`

## Step 4: Troubleshooting

### Issue: Build fails

- Check the build logs in Render dashboard
- Ensure all dependencies in `package.json` are correct
- Run `npm install` locally to verify there are no issues

### Issue: Service crashes

- Check **Logs** tab in Render dashboard
- Common cause: Port binding issue - verify PORT environment variable
- Check if FFmpeg is available in the environment

### Issue: Upload limits or timeouts

- Render's free tier has limitations
- Consider upgrading for better performance
- Set appropriate timeout values in Express

### Viewing Logs

In Render dashboard:

1. Go to your service
2. Click the **Logs** tab to see real-time logs
3. Download older logs if needed

## Step 5: Continuous Deployment

### Auto-Deploy on Push

Once connected, Render will automatically:

- Detect pushes to the `main` branch
- Trigger a new build
- Deploy if the build succeeds

### Manual Deployment

If needed, click **Manual Deploy** in your service dashboard

## Step 6: Production Considerations

### Recommendations

1. **Increase timeout for large files**: Currently set to upload 200MB
   - Render free tier may have limitations
   - Consider upgrading or optimizing

2. **Monitor storage**: Temp files are stored in `/tmp`
   - Free tier has limited disk space
   - Consider implementing cleanup for old conversions

3. **Database/Persistence**: Currently uses temp filesystem
   - Add a PostgreSQL database if you need persistent storage

4. **Environmental Limits**: Free tier specs
   - CPU: Shared
   - RAM: 512MB
   - Build hours: Limited
   - Consider upgrading for production use

## Step 7: Custom Domain (Optional)

1. In your Render service dashboard
2. Go to **Settings** tab
3. Under **Custom Domain**, enter your domain
4. Configure DNS records as instructed by Render

## Useful Commands (Local Testing)

```bash
# Test web server locally
npm run start:web

# Test with hot reload during development
npm run dev:web

# Build the application
npm run build:web
```

## Support

- Render.com Documentation: https://render.com/docs
- GitHub Integration Help: https://render.com/docs/github
- FFmpeg Issues: Check that ffmpeg-static is properly installed

## Deployment Checklist

- [ ] GitHub repository created and pushed
- [ ] Render account created
- [ ] Web service connected to GitHub
- [ ] Build and start commands configured
- [ ] Environment variables set
- [ ] Initial deployment successful
- [ ] Health check endpoint verified
- [ ] Web interface accessible
- [ ] File upload/conversion tested
- [ ] Custom domain configured (optional)

---

**Last Updated**: 2024
**Application**: Conversor de Audio Web
**Version**: 1.0.0
