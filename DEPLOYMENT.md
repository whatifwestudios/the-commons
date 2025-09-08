# Deployment Guide: Vercel + Fly.io

This guide walks you through deploying The Commons game with Vercel hosting the frontend and Fly.io hosting the backend.

## Prerequisites

1. **Vercel CLI**: `npm install -g vercel`
2. **Fly CLI**: Install from [fly.io/docs/getting-started/installing-flyctl](https://fly.io/docs/getting-started/installing-flyctl/)
3. **Accounts**: Sign up for both Vercel and Fly.io accounts

## Backend Deployment (Fly.io)

### 1. Deploy the Server

```bash
cd server
fly auth login
fly launch
```

When prompted:
- App name: `the-commons-server` (or choose your own)
- Region: Choose closest to your users
- Database: Skip for now
- Deploy now: **No** (we need to configure first)

### 2. Set Environment Variables

```bash
fly secrets set NODE_ENV=production
fly secrets set CLIENT_URL=https://your-vercel-app.vercel.app
```

### 3. Deploy

```bash
fly deploy
```

Your server will be available at: `https://the-commons-server.fly.dev`

## Frontend Deployment (Vercel)

### 1. Update Configuration

Edit `config.js` and update the production server URL:
```javascript
SERVER_URL: 'https://the-commons-server.fly.dev'
```

### 2. Deploy to Vercel

```bash
vercel
```

When prompted:
- Set up and deploy: **Y**
- Scope: Choose your account
- Link to existing project: **N**
- Project name: `the-commons`
- Directory: `./` (current directory)
- Override settings: **N**

### 3. Production Deployment

```bash
vercel --prod
```

## Configuration Updates

### Update Backend CORS

After getting your Vercel URL, update the backend environment:

```bash
cd server
fly secrets set CLIENT_URL=https://your-actual-vercel-url.vercel.app
fly deploy
```

### Test the Connection

1. Visit your Vercel URL
2. Check browser console for connection status
3. Verify multiplayer functionality works

## Environment Variables Reference

### Backend (Fly.io)
- `NODE_ENV=production`
- `CLIENT_URL=https://your-vercel-app.vercel.app`
- `PORT=3000` (automatically set)

### Frontend (Vercel)
- Configuration is handled automatically via `config.js`

## Monitoring and Logs

### Fly.io Logs
```bash
cd server
fly logs
```

### Vercel Logs
Check the Vercel dashboard at vercel.com

## Scaling (Optional)

### Add Redis for Multiple Server Instances

1. Add Redis instance on Fly.io:
```bash
fly redis create
```

2. Connect to your app:
```bash
fly secrets set REDIS_URL=redis://your-redis-url
```

3. Update server code to use Redis for session storage and room management

## Troubleshooting

### Common Issues

1. **CORS errors**: Ensure CLIENT_URL matches your Vercel domain exactly
2. **WebSocket connection fails**: Check that Fly.io app is running
3. **Assets not loading**: Verify all files are committed to git before Vercel deployment

### Health Check

- Backend: `https://the-commons-server.fly.dev/health`
- Frontend: Check browser developer console for connection status

## Custom Domain (Optional)

### Vercel
1. Add domain in Vercel dashboard
2. Update DNS records as instructed

### Fly.io
1. `fly certs add your-backend-domain.com`
2. Update DNS records to point to Fly.io

## Cost Estimation

### Fly.io
- Shared CPU: ~$2-5/month for basic usage
- Scales to zero when not in use

### Vercel
- Hobby plan: Free for personal projects
- Pro plan: $20/month for commercial use

Total estimated cost: $2-25/month depending on usage and plan selection.