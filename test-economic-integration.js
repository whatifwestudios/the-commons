/**
 * Economic Integration Tests
 * Tests server-client consistency and prevents authority confusion
 */

// Mock game state for testing
const mockGameState = {
    grid: {
        '0,0': {
            building: 'cottage-1',
            owner: 'player',
            landValue: { paidPrice: 1000 }
        },
        '0,1': {
            building: 'farmers-market-1',
            owner: 'player',
            landValue: { paidPrice: 1500 }
        }
    },
    buildings: {
        'cottage-1': {
            id: 'cottage',
            name: 'Cottage',
            category: 'housing',
            population: { jobsCreated: 0, bedroomsAdded: 2 },
            resources: { energyDemand: 5, foodDemand: 2 }
        },
        'farmers-market-1': {
            id: 'farmers_market',
            name: 'Farmers Market',
            category: 'commercial',
            population: { jobsCreated: 10, bedroomsAdded: 0 },
            resources: { foodProduction: 40, energyDemand: 0 }
        }
    }
};

// Import economic engines
const ServerEconomicEngine = require('./server-economic-engine');

/**
 * Test 1: Server Authority Validation
 * Ensures server calculations are used, not client fallbacks
 */
async function testServerAuthority() {
    console.log('🧪 Test 1: Server Authority Validation');

    const serverEngine = new ServerEconomicEngine();
    serverEngine.updateGameState(mockGameState);

    // Test building performance calculation
    const farmersMarketPerf = serverEngine.getBuildingPerformance(0, 1);

    if (!farmersMarketPerf.success) {
        throw new Error('❌ Server failed to calculate building performance');
    }

    const building = farmersMarketPerf.building;

    // Critical test: Farmers Market should show worker shortage
    const workerNeeds = building.needs.find(need => need.type === 'workers');

    if (!workerNeeds) {
        throw new Error('❌ Server missing worker needs for Farmers Market');
    }

    if (workerNeeds.satisfaction >= 1.0) {
        throw new Error(`❌ Server shows 100% worker satisfaction (${workerNeeds.satisfaction}) - should be < 1.0 due to worker shortage`);
    }

    console.log('✅ Server correctly identifies worker shortage:', {
        satisfaction: workerNeeds.satisfaction,
        required: workerNeeds.required
    });

    return true;
}

/**
 * Test 2: Connectivity Logic Validation
 * Ensures buildings only access connected resources
 */
async function testConnectivityLogic() {
    console.log('🧪 Test 2: Connectivity Logic Validation');

    const serverEngine = new ServerEconomicEngine();

    // Test isolated buildings (no roads)
    const isolatedState = {
        grid: {
            '0,0': { building: 'cottage-1' },
            '5,5': { building: 'farmers-market-1' } // Far apart
        },
        buildings: mockGameState.buildings
    };

    serverEngine.updateGameState(isolatedState);

    // Farmers Market at (5,5) should NOT see cottage workers at (0,0)
    const isolatedPerf = serverEngine.getBuildingPerformance(5, 5);
    const workerNeeds = isolatedPerf.building.needs.find(need => need.type === 'workers');

    if (workerNeeds.satisfaction > 0.1) {
        throw new Error(`❌ Isolated buildings accessing distant resources: satisfaction=${workerNeeds.satisfaction}`);
    }

    console.log('✅ Connectivity logic working: isolated buildings show needs');

    return true;
}

/**
 * Test 3: Supply/Demand Mapping Validation
 * Prevents the logic error we just fixed
 */
async function testSupplyDemandMapping() {
    console.log('🧪 Test 3: Supply/Demand Mapping Validation');

    const serverEngine = new ServerEconomicEngine();
    serverEngine.updateGameState(mockGameState);

    // Get connected resources for validation
    const accessibleParcels = serverEngine.getAccessibleParcels(0, 1);
    const resources = serverEngine.calculateConnectedResources(accessibleParcels);

    // Validate resource calculations
    const expectedHousingSupply = 2; // 1 cottage × 2 bedrooms
    const expectedJobsSupply = 10;   // 1 farmers market × 10 jobs
    const expectedHousingDemand = 10; // 1 farmers market needs 10 workers
    const expectedJobsDemand = 2;    // 1 cottage × 2 residents need jobs

    if (resources.housing.supply !== expectedHousingSupply) {
        throw new Error(`❌ Housing supply wrong: expected ${expectedHousingSupply}, got ${resources.housing.supply}`);
    }

    if (resources.housing.demand !== expectedHousingDemand) {
        throw new Error(`❌ Housing demand wrong: expected ${expectedHousingDemand}, got ${resources.housing.demand}`);
    }

    if (resources.jobs.supply !== expectedJobsSupply) {
        throw new Error(`❌ Jobs supply wrong: expected ${expectedJobsSupply}, got ${resources.jobs.supply}`);
    }

    if (resources.jobs.demand !== expectedJobsDemand) {
        throw new Error(`❌ Jobs demand wrong: expected ${expectedJobsDemand}, got ${resources.jobs.demand}`);
    }

    console.log('✅ Supply/demand mapping correct:', {
        housing: resources.housing,
        jobs: resources.jobs
    });

    return true;
}

/**
 * Test 4: Authority Consistency Check
 * Ensures server results match expected connectivity behavior
 */
async function testAuthorityConsistency() {
    console.log('🧪 Test 4: Authority Consistency Check');

    const serverEngine = new ServerEconomicEngine();
    serverEngine.updateGameState(mockGameState);

    // Test worker satisfaction calculation
    const workerSupplyDemand = serverEngine.getLocalSupplyDemand('workers', 0, 1);

    // Should be: supply=2 (cottage workers), demand=10 (farmers market needs)
    const expectedSatisfaction = workerSupplyDemand.supply / workerSupplyDemand.demand;
    const expectedSatisfactionPercent = Math.round(expectedSatisfaction * 100);

    if (expectedSatisfactionPercent >= 100) {
        throw new Error(`❌ Authority inconsistency: worker satisfaction should be < 100%, got ${expectedSatisfactionPercent}%`);
    }

    console.log('✅ Authority consistency validated:', {
        workerSupply: workerSupplyDemand.supply,
        workerDemand: workerSupplyDemand.demand,
        satisfaction: `${expectedSatisfactionPercent}%`
    });

    return true;
}

/**
 * Main test runner
 */
async function runIntegrationTests() {
    console.log('🚀 Starting Economic Integration Tests...\n');

    try {
        await testServerAuthority();
        await testConnectivityLogic();
        await testSupplyDemandMapping();
        await testAuthorityConsistency();

        console.log('\n🎉 ALL TESTS PASSED! Economic system integration is working correctly.');
        return true;

    } catch (error) {
        console.error('\n💥 TEST FAILED:', error.message);
        console.error('\n🔧 This indicates a regression in the economic system authority or logic.');
        return false;
    }
}

// Run tests if called directly
if (require.main === module) {
    runIntegrationTests().then(success => {
        process.exit(success ? 0 : 1);
    });
}

module.exports = {
    runIntegrationTests,
    testServerAuthority,
    testConnectivityLogic,
    testSupplyDemandMapping,
    testAuthorityConsistency
};