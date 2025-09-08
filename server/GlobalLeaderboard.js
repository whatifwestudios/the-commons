// Global tracking of all games and city rankings
class GlobalLeaderboard {
  constructor() {
    this.cityRankings = []; // All completed cities ranked by total land value
    this.playerProfiles = new Map(); // playerId -> PlayerProfile
    this.activeGames = new Map(); // gameId -> game data
    this.completedGames = []; // Historical game results
  }

  // Register a new game
  registerGame(gameId, initialData) {
    this.activeGames.set(gameId, {
      gameId,
      startTime: Date.now(),
      playerCount: initialData.playerCount,
      players: initialData.players.map(p => ({
        playerId: p.id,
        name: p.name,
        startingCash: p.cash
      }))
    });
  }

  // Process completed game results
  processGameResults(gameResults) {
    const { 
      gameId,
      finalLeaderboard, 
      cityScore, 
      playerCount,
      totalStartingCash 
    } = gameResults;

    // Calculate wealth gain percentages for each player
    const playersWithGains = finalLeaderboard.map(player => {
      const gameData = this.activeGames.get(gameId);
      const playerStartData = gameData?.players.find(p => p.playerId === player.id);
      const startingCash = playerStartData?.startingCash || 5000;
      
      const wealthGain = player.wealth - startingCash;
      const wealthGainPercent = (wealthGain / startingCash) * 100;

      return {
        ...player,
        startingCash,
        wealthGain,
        wealthGainPercent
      };
    });

    // Sort by wealth gain percentage to find winner
    const sortedByGain = [...playersWithGains].sort((a, b) => 
      b.wealthGainPercent - a.wealthGainPercent
    );

    // Add city to rankings and determine its global rank
    const cityResult = {
      cityId: gameId,
      cityName: cityScore.cityName,
      totalLandValue: cityScore.totalLandValue,
      playerCount,
      completedAt: Date.now(),
      players: playersWithGains
    };

    // Insert city in ranked position
    let cityRank = 1;
    for (let i = 0; i < this.cityRankings.length; i++) {
      if (cityResult.totalLandValue > this.cityRankings[i].totalLandValue) {
        this.cityRankings.splice(i, 0, cityResult);
        break;
      }
      cityRank++;
    }
    
    // If not inserted, add to end
    if (cityRank > this.cityRankings.length) {
      this.cityRankings.push(cityResult);
    }

    // Determine if this is the best city
    const isBestCity = cityRank === 1;

    // Update player profiles
    const highestGainPlayer = sortedByGain[0];
    
    playersWithGains.forEach((player, index) => {
      const gameResult = {
        gameId,
        startingCash: player.startingCash,
        finalWealth: player.wealth,
        wealthGainPercent: player.wealthGainPercent,
        cityRank,
        individualRank: index + 1,
        hadHighestGain: player.id === highestGainPlayer.id,
        inBestCity: isBestCity,
        bonusesEarned: []
      };

      // Calculate bonuses
      if (gameResult.hadHighestGain) {
        gameResult.bonusesEarned.push('Highest Wealth Gain (+1% starting cash)');
      }
      if (gameResult.inBestCity) {
        gameResult.bonusesEarned.push('Best City (+2% starting cash)');
      }
      if (gameResult.hadHighestGain && gameResult.inBestCity) {
        gameResult.bonusesEarned.push('Double Winner (+2% additional starting cash)');
      }

      // Get or create player profile
      let profile = this.playerProfiles.get(player.id);
      if (!profile) {
        const PlayerProfile = require('./PlayerProfile');
        profile = new PlayerProfile(player.id, player.name);
        this.playerProfiles.set(player.id, profile);
      }

      // Update profile with game result
      profile.updateFromGameResult(gameResult);
    });

    // Store completed game
    this.completedGames.push({
      ...cityResult,
      highestGainPlayer: {
        id: highestGainPlayer.id,
        name: highestGainPlayer.name,
        gainPercent: highestGainPlayer.wealthGainPercent.toFixed(1)
      },
      isBestCity,
      cityRank
    });

    // Clean up active game
    this.activeGames.delete(gameId);

    // Keep only top 1000 cities to prevent memory issues
    if (this.cityRankings.length > 1000) {
      this.cityRankings = this.cityRankings.slice(0, 1000);
    }

    // Keep only last 500 completed games
    if (this.completedGames.length > 500) {
      this.completedGames = this.completedGames.slice(-500);
    }

    return {
      cityRank,
      isBestCity,
      highestGainPlayer: highestGainPlayer.id,
      playerResults: playersWithGains.map(p => ({
        playerId: p.id,
        name: p.name,
        finalWealth: p.wealth,
        wealthGainPercent: p.wealthGainPercent.toFixed(1) + '%',
        hadHighestGain: p.id === highestGainPlayer.id,
        inBestCity: isBestCity,
        nextStartingCash: this.playerProfiles.get(p.id)?.getStartingCash() || 5000
      }))
    };
  }

  // Get player's profile and starting cash for next game
  getPlayerProfile(playerId, playerName) {
    let profile = this.playerProfiles.get(playerId);
    if (!profile) {
      const PlayerProfile = require('./PlayerProfile');
      profile = new PlayerProfile(playerId, playerName);
      this.playerProfiles.set(playerId, profile);
    }
    return profile;
  }

  // Get global statistics
  getGlobalStats() {
    return {
      totalCities: this.cityRankings.length,
      totalGames: this.completedGames.length,
      totalPlayers: this.playerProfiles.size,
      topCities: this.cityRankings.slice(0, 10).map((city, index) => ({
        rank: index + 1,
        name: city.cityName,
        totalLandValue: city.totalLandValue.toLocaleString(),
        playerCount: city.playerCount,
        completedAt: new Date(city.completedAt).toLocaleDateString()
      })),
      recentGames: this.completedGames.slice(-10).reverse().map(game => ({
        cityName: game.cityName,
        cityRank: game.cityRank,
        playerCount: game.playerCount,
        winner: game.highestGainPlayer.name,
        winnerGain: game.highestGainPlayer.gainPercent + '%',
        isBestCity: game.isBestCity
      }))
    };
  }

  // Get leaderboards
  getTopPlayers() {
    const players = Array.from(this.playerProfiles.values())
      .filter(p => p.gamesPlayed > 0)
      .sort((a, b) => {
        // Sort by games won, then by best cities, then by multiplier
        if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
        if (b.bestCities !== a.bestCities) return b.bestCities - a.bestCities;
        return b.totalMultiplier - a.totalMultiplier;
      });

    return players.slice(0, 50).map((player, index) => ({
      rank: index + 1,
      name: player.name,
      gamesPlayed: player.gamesPlayed,
      gamesWon: player.gamesWon,
      winRate: ((player.gamesWon / player.gamesPlayed) * 100).toFixed(1) + '%',
      bestCities: player.bestCities,
      doubleWins: player.doubleWins,
      currentMultiplier: player.totalMultiplier.toFixed(3) + 'x',
      nextStartingCash: '$' + player.getStartingCash().toLocaleString()
    }));
  }

  // Serialize for persistence (if using file storage)
  toJSON() {
    return {
      cityRankings: this.cityRankings,
      playerProfiles: Array.from(this.playerProfiles.entries()).map(([id, profile]) => [
        id, 
        profile.toJSON()
      ]),
      completedGames: this.completedGames
    };
  }

  // Deserialize from persistence
  static fromJSON(data) {
    const leaderboard = new GlobalLeaderboard();
    
    if (data.cityRankings) {
      leaderboard.cityRankings = data.cityRankings;
    }
    
    if (data.playerProfiles) {
      const PlayerProfile = require('./PlayerProfile');
      leaderboard.playerProfiles = new Map(
        data.playerProfiles.map(([id, profileData]) => [
          id,
          PlayerProfile.fromJSON(profileData)
        ])
      );
    }
    
    if (data.completedGames) {
      leaderboard.completedGames = data.completedGames;
    }
    
    return leaderboard;
  }
}

module.exports = GlobalLeaderboard;