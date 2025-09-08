#!/bin/bash

echo "🚀 The Commons - Deployment Script"
echo "=================================="
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git add .
    git commit -m "Initial commit: The Commons game"
    echo "✅ Git repository initialized"
fi

echo ""
echo "Choose deployment platform:"
echo "1) Vercel (Recommended)"
echo "2) Netlify"
echo "3) GitHub Pages"
echo "4) Exit"
echo ""
read -p "Enter choice [1-4]: " choice

case $choice in
    1)
        echo ""
        echo "📦 Deploying to Vercel..."
        
        # Check if vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm i -g vercel
        fi
        
        echo "Starting Vercel deployment..."
        vercel --prod
        
        echo ""
        echo "✅ Deployment complete!"
        echo "Your game is now live on Vercel!"
        ;;
        
    2)
        echo ""
        echo "📦 Deploying to Netlify..."
        
        # Check if netlify CLI is installed
        if ! command -v netlify &> /dev/null; then
            echo "Installing Netlify CLI..."
            npm i -g netlify-cli
        fi
        
        echo "Starting Netlify deployment..."
        netlify deploy --prod --dir=.
        
        echo ""
        echo "✅ Deployment complete!"
        echo "Your game is now live on Netlify!"
        ;;
        
    3)
        echo ""
        echo "📦 Setting up GitHub Pages..."
        echo ""
        echo "Steps to deploy on GitHub Pages:"
        echo "1. Create a GitHub repository"
        echo "2. Run these commands:"
        echo ""
        echo "   git remote add origin https://github.com/YOUR_USERNAME/the-commons.git"
        echo "   git branch -M main"
        echo "   git push -u origin main"
        echo ""
        echo "3. Go to Settings → Pages in your GitHub repo"
        echo "4. Select 'Deploy from a branch'"
        echo "5. Choose 'main' branch and '/ (root)' folder"
        echo "6. Click Save"
        echo ""
        echo "Your game will be available at:"
        echo "https://YOUR_USERNAME.github.io/the-commons"
        ;;
        
    4)
        echo "Exiting..."
        exit 0
        ;;
        
    *)
        echo "Invalid choice. Exiting..."
        exit 1
        ;;
esac

echo ""
echo "🎮 Happy gaming!"