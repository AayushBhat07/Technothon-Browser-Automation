# 🐛 Debugging Guide: Smart Web Collector Extension

## Issue 1: Can't Find AI Extraction Button

### Why the Button Might Not Appear

The "🤖 Extract Structure with AI" button only shows when **ALL** of these conditions are met:

1. ✅ Item `type` = `"text"` (not `"image"`, `"link"`, etc.)
2. ✅ Item content has **more than 50 words**
3. ✅ Content appears **unstructured** (not already key-value pairs)
4. ✅ Item is **not already AI-extracted** (`ai_extracted !== true`)

### Step-by-Step Debugging

#### Step 1: Reload the Extension
1. Open `chrome://extensions/`
2. Find "Smart Web Collector"
3. Click the **🔄 reload icon**
4. Check for red error messages

#### Step 2: Open Developer Console
1. Open the side panel
2. Right-click anywhere in the side panel
3. Select "Inspect" or "Inspect Element"
4. Go to the **Console** tab
5. Look for errors (red text)
6. **Share any errors you see with me**

#### Step 3: Use the Test Page
1. Open `file:///Users/aayush07/Desktop/smart-web-collector/test-page.html` in Chrome
2. Select the text in "Test 1: Contact Information"
3. Right-click > "Save to Smart Collector"
4. Choose or create a collection
5. Open the side panel
6. The item card should show the AI button

#### Step 4: Check Item Data Structure

Open the console in the side panel and run:
```javascript
// Get all collections
storage.getCollections().then(collections => {
    console.log('Collections:', collections);
    if (collections.length > 0) {
        console.log('First collection items:', collections[0].items);
    }
});
```

Look for:
- `type`: should be `"text"`
- `data.content`: should have >50 words
- Word count: count the words in content

## Issue 2: Enrichment Not Working

The enrichment feature uses a **mock API** (not real data). Here's what should happen:

### Expected Behavior
1. Select items with checkboxes
2. Click "Enrich" button
3. Button shows "Enriching 1/3..." etc.
4. After ~1 second per item, enriched data appears
5. Items show "Enriched" badge

### Mock Data Rules
- If text contains "tech" → adds company_size, industry: "Technology"
- If text contains "finance" → adds industry: "Finance"
- Otherwise → adds generic "Unknown" data

### Debug Steps for Enrichment

1. **Check if button is enabled**:
   - Select at least one item (checkbox)
   - "Enrich" button should become clickable

2. **Check console for errors**:
   - Open console (Right-click > Inspect)
   - Click "Enrich"
   - Watch for errors

3. **Verify selection**:
   ```javascript
   // In console:
   document.querySelectorAll('.item-checkbox:checked').length
   // Should return > 0
   ```

## Common Issues & Solutions

### Issue: Extension Won't Load
**Solution**: 
- Make sure you're loading from `/Users/aayush07/Desktop/smart-web-collector`
- Check manifest.json has no syntax errors
- Check all file paths in manifest exist

### Issue: Side Panel Won't Open
**Solution**:
- Try clicking the extension icon first
- Then click "View All" button in popup
- Or use Ctrl+Click (Mac: Cmd+Click) on extension icon

### Issue: Items Not Saving
**Solution**:
- Check background.js console: Right-click extension icon > "Inspect service worker"
- Look for errors when you try to save

### Issue: JavaScript Errors
**Common error**: `Cannot read property 'content' of undefined`
**Solution**: Item might not have the expected data structure

## Quick Test Checklist

- [ ] Extension loaded at `chrome://extensions/`
- [ ] Extension has green/enabled toggle
- [ ] No error messages on extension card
- [ ] Can open popup by clicking icon
- [ ] Can open side panel
- [ ] Can create new collection
- [ ] Can save text from test page
- [ ] Items appear in collection
- [ ] Item has >50 words of text
- [ ] Item type shows as "text" in footer
- [ ] Console has no JavaScript errors

## Still Not Working?

Please share with me:

1. **Screenshot** of the side panel showing your items
2. **Console errors** (Right-click side panel > Inspect > Console tab)
3. **Item data** from console:
   ```javascript
   storage.getCollections().then(c => console.log(JSON.stringify(c[0].items[0], null, 2)))
   ```
4. **Extension errors** from chrome://extensions/

Then I can help debug the specific issue!
