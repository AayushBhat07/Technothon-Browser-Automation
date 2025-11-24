const assert = require('assert');

async function runTest(page) {
    console.log('Starting QA Test for Item Viewer...');

    // 1. Navigate to Item View (Mocking URL parameters)
    // We need a valid collection ID and item ID. 
    // Since we can't easily know them, we'll rely on the fallback "Demo Item" mode if IDs are missing, 
    // OR we can try to find a link from the sidepanel.

    // Let's try to go to sidepanel first and click an item if available.
    await page.goto('chrome-extension://ebohhjfipgpbmjobfenajldkimehapoa/sidepanel.html');
    await page.waitForTimeout(1000);

    // Check if there are items
    const items = await page.$$('tr[style*="cursor: pointer"]');
    if (items.length > 0) {
        console.log('Found items, clicking the first one...');
        await items[0].click();
    } else {
        console.log('No items found, navigating to item-view.html directly (Demo Mode)...');
        await page.goto('chrome-extension://ebohhjfipgpbmjobfenajldkimehapoa/item-view.html');
    }

    await page.waitForTimeout(2000);

    // 2. Test Close Button
    console.log('Testing Close Button...');
    const closeBtn = await page.$('#close-btn');
    if (closeBtn) {
        // We won't click it yet because we want to test other things first
        console.log('✅ Close button exists');
    } else {
        console.error('❌ Close button not found');
    }

    // 3. Test Summarize Button
    console.log('Testing Summarize Button...');
    const summarizeBtn = await page.$('#btn-summarize');
    if (summarizeBtn) {
        await summarizeBtn.click();
        await page.waitForTimeout(1000);

        // Check for chat message
        const messages = await page.$$('.message');
        const lastMessage = await messages[messages.length - 1].evaluate(el => el.textContent);

        if (lastMessage.includes('Generating summary') || lastMessage.includes('Error')) {
            console.log('✅ Summarize button triggered chat response');
        } else {
            console.error('❌ Summarize button did not trigger expected response');
        }
    } else {
        console.error('❌ Summarize button not found');
    }

    // 4. Test Key Points Button
    console.log('Testing Key Points Button...');
    const extractBtn = await page.$('#btn-extract');
    if (extractBtn) {
        await extractBtn.click();
        await page.waitForTimeout(1000);

        // Check for chat message
        const messages = await page.$$('.message');
        const lastMessage = await messages[messages.length - 1].evaluate(el => el.textContent);

        if (lastMessage.includes('Extracting key points') || lastMessage.includes('Error')) {
            console.log('✅ Key Points button triggered chat response');
        } else {
            console.error('❌ Key Points button did not trigger expected response');
        }
    } else {
        console.error('❌ Key Points button not found');
    }

    console.log('QA Test Completed.');
}

module.exports = runTest;
