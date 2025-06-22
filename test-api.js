#!/usr/bin/env node

const BASE_URL = 'http://localhost:8787';

async function testAPI() {
	console.log('🔍 Testing Teyvat Archive Uptime Monitor API\n');

	// Test root endpoint
	console.log('1. Testing root endpoint:');
	try {
		const response = await fetch(BASE_URL);
		const text = await response.text();
		console.log(`   Status: ${response.status}`);
		console.log(`   Response: ${text}\n`);
	} catch (error) {
		console.log(`   Error: ${error.message}\n`);
	}

	// Test status endpoint
	console.log('2. Testing /api/status endpoint:');
	try {
		const response = await fetch(`${BASE_URL}/api/status`);
		const data = await response.json();
		console.log(`   Status: ${response.status}`);
		console.log('   Response:', JSON.stringify(data, null, 2), '\n');
	} catch (error) {
		console.log(`   Error: ${error.message}\n`);
	}

	// Test history endpoints for each site
	const sites = ['main', 'dashboard', 'api', 'cdn'];

	for (const site of sites) {
		console.log(`3. Testing /api/history?site=${site} endpoint:`);
		try {
			const response = await fetch(`${BASE_URL}/api/history?site=${site}`);
			const data = await response.json();
			console.log(`   Status: ${response.status}`);
			console.log(`   History entries: ${data.length}`);
			if (data.length > 0) {
				console.log('   Latest entry:', JSON.stringify(data[0], null, 2));
			}
			console.log();
		} catch (error) {
			console.log(`   Error: ${error.message}\n`);
		}
	}

	// Trigger scheduled check
	console.log('4. Triggering scheduled check:');
	try {
		const response = await fetch(`${BASE_URL}/__scheduled?cron=*/5%20*%20*%20*%20*`, {
			method: 'POST',
		});
		console.log(`   Status: ${response.status}`);
		console.log('   Scheduled check triggered successfully\n');

		// Wait a moment and check status again
		console.log('5. Checking status after scheduled run:');
		await new Promise((resolve) => setTimeout(resolve, 2000));

		const statusResponse = await fetch(`${BASE_URL}/api/status`);
		const statusData = await statusResponse.json();
		console.log('   Updated status:', JSON.stringify(statusData, null, 2));
	} catch (error) {
		console.log(`   Error: ${error.message}\n`);
	}
}

testAPI().catch(console.error);
