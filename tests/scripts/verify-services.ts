const services = [
    { name: 'Hub API', url: 'http://localhost:3000/api' },
    { name: 'Rummy Live', url: 'http://localhost:3400/health' },
    { name: 'Dragon Tiger', url: 'http://localhost:3401' },
    { name: 'Aviator', url: 'http://localhost:3402' },
    { name: 'Seven Up Down', url: 'http://localhost:3403' },
];

async function checkServices() {
    console.log('--- Platform Health Check ---');
    for (const svc of services) {
        try {
            const start = Date.now();
            const res = await fetch(svc.url);
            const end = Date.now();
            console.log(`✅ ${svc.name.padEnd(15)}: ONLINE (${res.status}) - ${end - start}ms`);
        } catch (e: any) {
            console.log(`❌ ${svc.name.padEnd(15)}: OFFLINE (${e.message})`);
        }
    }
    console.log('------------------------------');
}

checkServices();
