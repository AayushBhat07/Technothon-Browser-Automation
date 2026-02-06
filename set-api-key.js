// Run this in the extension's background service worker console to set the API key
chrome.storage.sync.set({ 'google_ai_api_key': 'AIzaSyAak-l5xB0e6344YQvPEtdtTi6H5InfOdo' }, () => {
    console.log('✅ API Key saved successfully!');
    console.log('Reload the extension and try the Magic Bar again.');
});
