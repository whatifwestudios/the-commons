# The Commons - City Building Game

A city-building game that explores land value economics and urban development.

## 🎮 Play Now

Visit the live game at: [Coming Soon]

## 🚀 Quick Start

### Local Development
```bash
# Clone the repository
git clone https://github.com/yourusername/the-commons.git
cd the-commons

# Start local server
python3 -m http.server 8000
# OR
npm start

# Open in browser
open http://localhost:8000
```

## 📦 Deployment

### Deploy to Vercel (Recommended)

#### Option 1: One-Click Deploy
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/the-commons)

#### Option 2: CLI Deploy
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Deploy to production
vercel --prod
```

#### Option 3: GitHub Integration
1. Push code to GitHub
2. Import project on [vercel.com](https://vercel.com)
3. Auto-deploy on every push

### Deploy to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/yourusername/the-commons)

### Deploy to GitHub Pages
```bash
# The game is already static, just enable GitHub Pages
# Settings → Pages → Source: Deploy from branch (main)
```

## 🎯 Features

- **Player Customization**: Choose your name, color, and emoji
- **City Building**: Place various buildings and infrastructure
- **Economic Simulation**: Land value tax system
- **Governance**: Vote on budget priorities
- **Multiple View Modes**: Normal, land value heatmap, cashflow, transportation

## 🛠️ Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5 Canvas
- **Styling**: CSS3
- **Game Engine**: Custom isometric rendering
- **Deployment**: Static site (Vercel/Netlify ready)

## 🎮 Game Controls

- **Click**: Select/buy parcels
- **Right Click**: Open context menu
- **Zoom**: Use +/- buttons or mouse wheel
- **Pan**: Click and drag when zoomed in

## 📝 Development

### Project Structure
```
the-commons/
├── index.html          # Main game page
├── style.css           # Game styling
├── game.js            # Core game logic
├── buildings.js       # Building definitions
├── package.json       # NPM configuration
├── vercel.json        # Vercel deployment config
└── README.md          # This file
```

### Adding New Buildings
Buildings are defined in `buildings.js`. Add new buildings to the `buildingsData` array:

```javascript
{
  id: 'unique_id',
  name: 'Building Name',
  category: 'residential|commercial|industrial|civic',
  price: 1000,
  population: 10,
  jobs: 5,
  // ... other properties
}
```

## 🚦 Roadmap

- [x] Single-player gameplay
- [x] Player customization
- [x] Basic economics
- [ ] Save/Load games
- [ ] Multiplayer support
- [ ] Advanced transportation
- [ ] Achievements
- [ ] Mobile support

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

MIT License - feel free to use this project for any purpose.

## 🙏 Acknowledgments

- Inspired by SimCity and Cities: Skylines
- Economic model based on Georgist principles
- Built with Claude Code assistance

## 📧 Contact

Questions? Open an issue on GitHub or reach out to [your-email]

---

**Ready to build your city? Deploy now and start playing!**