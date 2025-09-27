/**
 * Test Mobility v2 Integration
 * Run in browser console to test the new system
 */

// Test script to verify Mobility v2 is working
function testMobilityV2() {
    console.log('🧪 Testing Mobility Layer v2...');

    // Check if classes are loaded
    if (typeof MobilityLayerV2 === 'undefined') {
        console.error('❌ MobilityLayerV2 class not found - check mobility-layer-v2.js loading');
        return false;
    }

    if (typeof MobilityV2Integration === 'undefined') {
        console.error('❌ MobilityV2Integration class not found - check mobility-v2-integration.js loading');
        return false;
    }

    console.log('✅ Mobility v2 classes loaded successfully');

    // Check if game has mobility v2 instance
    if (typeof window.game === 'undefined') {
        console.error('❌ Game instance not found');
        return false;
    }

    if (!window.game.mobilityV2) {
        console.error('❌ mobilityV2 not initialized on game instance');
        return false;
    }

    console.log('✅ MobilityV2Integration instance found on game');

    // Get status
    const status = window.game.mobilityV2.getStatus();
    console.log('📊 Mobility v2 Status:', status);

    // Check if modal exists
    if (window.game.mobilityV2.mobilityLayer && window.game.mobilityV2.mobilityLayer.modal) {
        console.log('✅ Mobility modal created');

        // Test modal visibility
        window.game.mobilityV2.mobilityLayer.show();
        console.log('✅ Mobility modal shown');

        // Test cost calculation
        const currentCost = window.game.mobilityV2.mobilityLayer.getCurrentSelectionCost();
        console.log('💰 Current selection cost:', currentCost);

        return true;
    } else {
        console.error('❌ Mobility modal not created');
        return false;
    }
}

// Auto-run test when included
if (typeof window !== 'undefined' && window.game) {
    // Wait a bit for initialization
    setTimeout(() => {
        testMobilityV2();
    }, 1000);
} else {
    console.log('🔄 Waiting for game initialization...');
}