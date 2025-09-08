// Persistent player profiles that track performance across games
class PlayerProfile {
  constructor(playerId, name) {
    this.playerId = playerId;
    this.name = name;
    this.createdAt = Date.now();
    
    // Performance tracking
    this.gamesPlayed = 0;
    this.gamesWon = 0;
    this.bestCities = 0; // Number of times in best performing city
    this.doubleWins = 0; // Times won both individual and city bonus
    
    // Multipliers earned from previous games
    this.multipliers = {
      highestGain: 1.0,     // 1.01x for highest % gain in a game
      bestCity: 1.0,        // 1.02x for being in best city
      doubleBonus: 1.0      // Additional 1.02x for winning in best city
    };
    
    // Current effective multiplier
    this.totalMultiplier = 1.0;
    
    // Historical data
    this.gameHistory = [];
  }

  // Calculate starting cash for next game
  getStartingCash() {
    const baseCash = 5000;
    this.totalMultiplier = this.multipliers.highestGain * 
                          this.multipliers.bestCity * 
                          this.multipliers.doubleBonus;
    return Math.round(baseCash * this.totalMultiplier);
  }

  // Update profile after game ends
  updateFromGameResult(gameResult) {
    this.gamesPlayed++;
    
    // Track game in history
    this.gameHistory.push({
      gameId: gameResult.gameId,
      timestamp: Date.now(),
      startingCash: gameResult.startingCash,
      finalWealth: gameResult.finalWealth,
      wealthGainPercent: gameResult.wealthGainPercent,
      cityRank: gameResult.cityRank,
      individualRank: gameResult.individualRank,
      bonusesEarned: gameResult.bonusesEarned
    });

    // Reset multipliers (they don't stack across games)
    this.multipliers = {
      highestGain: 1.0,
      bestCity: 1.0,
      doubleBonus: 1.0
    };

    // Apply new multipliers based on this game's performance
    if (gameResult.hadHighestGain) {
      this.multipliers.highestGain = 1.01;
      this.gamesWon++;
    }

    if (gameResult.inBestCity) {
      this.multipliers.bestCity = 1.02;
      this.bestCities++;
    }

    if (gameResult.hadHighestGain && gameResult.inBestCity) {
      this.multipliers.doubleBonus = 1.02; // Additional multiplier
      this.doubleWins++;
    }

    // Calculate new total multiplier for next game
    this.totalMultiplier = this.multipliers.highestGain * 
                          this.multipliers.bestCity * 
                          this.multipliers.doubleBonus;
  }

  // Get player stats for display
  getStats() {
    const winRate = this.gamesPlayed > 0 ? 
      (this.gamesWon / this.gamesPlayed * 100).toFixed(1) : 0;
    
    const cityRate = this.gamesPlayed > 0 ? 
      (this.bestCities / this.gamesPlayed * 100).toFixed(1) : 0;

    return {
      gamesPlayed: this.gamesPlayed,
      gamesWon: this.gamesWon,
      winRate: winRate + '%',
      bestCities: this.bestCities,
      cityRate: cityRate + '%',
      doubleWins: this.doubleWins,
      currentMultiplier: this.totalMultiplier.toFixed(3) + 'x',
      nextStartingCash: this.getStartingCash()
    };
  }

  // Serialize for storage
  toJSON() {
    return {
      playerId: this.playerId,
      name: this.name,
      createdAt: this.createdAt,
      gamesPlayed: this.gamesPlayed,
      gamesWon: this.gamesWon,
      bestCities: this.bestCities,
      doubleWins: this.doubleWins,
      multipliers: this.multipliers,
      totalMultiplier: this.totalMultiplier,
      gameHistory: this.gameHistory.slice(-20) // Keep last 20 games
    };
  }

  // Deserialize from storage
  static fromJSON(data) {
    const profile = new PlayerProfile(data.playerId, data.name);
    Object.assign(profile, data);
    return profile;
  }
}

module.exports = PlayerProfile;