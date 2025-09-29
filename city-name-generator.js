/**
 * Server-side City Name Generator for The Commons V2
 *
 * Generates unique, fun city names using combinatorial word sets.
 * Supports 10,000+ unique combinations with a bit of silliness.
 */

class CityNameGenerator {
    constructor() {
        // Prefix words - geographic/directional terms
        this.prefixes = [
            'North', 'South', 'East', 'West', 'Upper', 'Lower', 'New', 'Old',
            'Greater', 'Little', 'Big', 'Grand', 'Royal', 'Mount', 'Fort', 'Port',
            'Saint', 'Lake', 'River', 'Ocean', 'Bay', 'Cape', 'Point', 'Golden',
            'Silver', 'Iron', 'Copper', 'Stone', 'Crystal', 'Diamond', 'Ruby',
            'Emerald', 'Sunny', 'Shady', 'Misty', 'Foggy', 'Windy', 'Rocky',
            'Sandy', 'Muddy', 'Snowy', 'Rainy', 'Stormy', 'Peaceful', 'Wild',
            'Broken', 'Hidden', 'Lost', 'Found', 'Ancient', 'Modern', 'Future',
            'Happy', 'Jolly', 'Grumpy', 'Sleepy', 'Dizzy', 'Lazy', 'Busy',
            'Mad', 'Mega', 'Ultra', 'Super', 'Hyper', 'Mini', 'Tiny', 'Giant'
        ];

        // Root words - main city name components
        this.roots = [
            'Ridge', 'Valley', 'Hill', 'Dale', 'Glen', 'Hollow', 'Creek', 'Brook',
            'Falls', 'Rapids', 'Bridge', 'Crossing', 'Junction', 'Mills', 'Works',
            'Springs', 'Wells', 'Meadow', 'Field', 'Grove', 'Woods', 'Forest',
            'Park', 'Garden', 'Harbor', 'Haven', 'Cove', 'Bay', 'Shore', 'Beach',
            'Island', 'Rock', 'Stone', 'Peak', 'Summit', 'Heights', 'View', 'Vista',
            'Manor', 'Hall', 'Castle', 'Tower', 'Gate', 'Plaza', 'Square', 'Circle',
            'Center', 'Commons', 'Market', 'Trade', 'Commerce', 'Exchange', 'Bank',
            'Forge', 'Anvil', 'Hammer', 'Wheel', 'Gear', 'Steam', 'Coal', 'Iron',
            'Copper', 'Brass', 'Bronze', 'Steel', 'Chrome', 'Neon', 'Pixel', 'Code',
            'Byte', 'Data', 'Cloud', 'Web', 'Net', 'Link', 'Node', 'Hub', 'Port',
            'Socket', 'Buffer', 'Cache', 'Stack', 'Queue', 'Tree', 'Hash', 'Key',
            'Waffles', 'Pancakes', 'Donuts', 'Bagels', 'Muffins', 'Cookies', 'Cake',
            'Pie', 'Taco', 'Burrito', 'Pizza', 'Pasta', 'Noodles', 'Soup', 'Sandwich',
            'Coffee', 'Tea', 'Soda', 'Juice', 'Smoothie', 'Latte', 'Mocha', 'Brew',
            'Pickle', 'Pretzel', 'Popcorn', 'Chips', 'Salsa', 'Cheese', 'Butter',
            'Honey', 'Maple', 'Vanilla', 'Chocolate', 'Caramel', 'Fudge', 'Candy'
        ];

        // Suffix words - descriptive endings
        this.suffixes = [
            'ton', 'burg', 'ville', 'city', 'town', 'dale', 'ford', 'port', 'shire',
            'land', 'wood', 'field', 'brook', 'creek', 'river', 'lake', 'pond',
            'bay', 'cove', 'point', 'rock', 'stone', 'hill', 'mount', 'peak',
            'valley', 'glen', 'hollow', 'grove', 'meadow', 'plain', 'ridge',
            'falls', 'rapids', 'springs', 'wells', 'bridge', 'crossing', 'junction',
            'mills', 'works', 'forge', 'foundry', 'factory', 'plant', 'yard',
            'depot', 'station', 'terminal', 'hub', 'center', 'plaza', 'square',
            'heights', 'gardens', 'acres', 'estates', 'manor', 'hall', 'court',
            'gate', 'wall', 'tower', 'castle', 'keep', 'fort', 'haven', 'sanctuary',
            'opolis', 'apolis', 'ington', 'ston', 'ham', 'wick', 'worth', 'by',
            'thorpe', 'thwaite', 'garth', 'stead', 'lea', 'ley', 'ney', 'ay',
            'ex', 'ix', 'ox', 'ux', 'yz', 'zz', 'ia', 'ana', 'iana', 'onia',
            'eria', 'oria', 'uria', 'yria', 'opia', 'upia', 'epia', 'ipia'
        ];

        // Track used names to avoid duplicates
        this.usedNames = new Set();
    }

    /**
     * Generate a unique city name
     * @returns {string} A unique city name
     */
    generateCityName() {
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            const name = this.createName();
            if (!this.usedNames.has(name)) {
                this.usedNames.add(name);
                return name;
            }
            attempts++;
        }

        // Fallback: append number to ensure uniqueness
        const baseName = this.createName();
        let counter = 1;
        let uniqueName = `${baseName} ${counter}`;

        while (this.usedNames.has(uniqueName)) {
            counter++;
            uniqueName = `${baseName} ${counter}`;
        }

        this.usedNames.add(uniqueName);
        return uniqueName;
    }

    /**
     * Create a city name from word components
     * @returns {string} A generated city name
     */
    createName() {
        const usePrefix = Math.random() < 0.7; // 70% chance of prefix
        const useSuffix = Math.random() < 0.8; // 80% chance of suffix

        let name = '';

        if (usePrefix) {
            name += this.getRandomElement(this.prefixes) + ' ';
        }

        name += this.getRandomElement(this.roots);

        if (useSuffix) {
            name += this.getRandomElement(this.suffixes);
        }

        return name.trim();
    }

    /**
     * Get a random element from an array
     * @param {Array} array - The array to pick from
     * @returns {*} A random element
     */
    getRandomElement(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    /**
     * Generate multiple unique city names
     * @param {number} count - Number of names to generate
     * @returns {Array<string>} Array of unique city names
     */
    generateCityNames(count) {
        const names = [];
        for (let i = 0; i < count; i++) {
            names.push(this.generateCityName());
        }
        return names;
    }

    /**
     * Get statistics about possible combinations
     * @returns {Object} Statistics object
     */
    getStats() {
        const prefixCombos = this.prefixes.length;
        const rootCombos = this.roots.length;
        const suffixCombos = this.suffixes.length;

        // Calculate total possible combinations
        const withoutPrefixSuffix = rootCombos;
        const withPrefixOnly = prefixCombos * rootCombos;
        const withSuffixOnly = rootCombos * suffixCombos;
        const withBoth = prefixCombos * rootCombos * suffixCombos;

        const totalCombinations = withoutPrefixSuffix + withPrefixOnly + withSuffixOnly + withBoth;

        return {
            prefixes: prefixCombos,
            roots: rootCombos,
            suffixes: suffixCombos,
            totalCombinations,
            usedNames: this.usedNames.size,
            remainingCombinations: totalCombinations - this.usedNames.size
        };
    }

    /**
     * Reset the used names cache
     */
    reset() {
        this.usedNames.clear();
    }

    /**
     * Check if a name has been used
     * @param {string} name - The name to check
     * @returns {boolean} True if name has been used
     */
    isNameUsed(name) {
        return this.usedNames.has(name);
    }
}

module.exports = CityNameGenerator;