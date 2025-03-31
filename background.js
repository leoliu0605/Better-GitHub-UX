// Better GitHub UX - Background Script
// This script handles communication between content scripts and extension popup

// Store temporary repository data for communication
let tempRepoData = null;

// Log when background script loads
console.log('Better GitHub UX background script loaded');

// Listen for messages from content scripts or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background script received message:', message);
  
  // Store access token when received from popup
  if (message.action === 'storeAccessToken' && message.token) {
    // Store token in multiple locations for redundancy and reliability
    chrome.storage.local.set({ accessToken: message.token }, () => {
      console.log('Access token stored in local storage');
      
      // Also store in session storage if available (for current session)
      if (chrome.storage.session) {
        chrome.storage.session.set({ accessToken: message.token }, () => {
          console.log('Access token stored in session storage');
        });
      }
      
      // Store a reference in sync storage (without the actual token for security)
      chrome.storage.sync.set({ hasAccessToken: true }, () => {
        console.log('Token reference stored in sync storage');
      });
      
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Return access token when requested
  if (message.action === 'getAccessToken') {
    getAccessTokenFromAllSources().then(token => {
      console.log('Returning access token to requestor:', token ? 'token found' : 'no token');
      sendResponse({ token: token });
    }).catch(error => {
      console.error('Error getting access token for requestor:', error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the connection open for the async response
  }
  
  // Handle different message actions
  if (message.action === 'openCategoriesDialog') {
    // Store the repository data temporarily
    tempRepoData = message.repo;
    
    // Open the extension popup
    openExtensionPopup();
    
    // Acknowledge receipt of message
    sendResponse({ success: true });
    return true;
  }
  
  // Return repository data to popup when requested
  if (message.action === 'getRepositoryData') {
    console.log('Sending repository data to popup:', tempRepoData);
    sendResponse({ repo: tempRepoData });
    return true;
  }
  
  // Get all categories
  if (message.action === 'getCategories') {
    getCategories().then(categories => {
      console.log('Sending categories to content script:', categories);
      sendResponse({ categories: categories });
    }).catch(error => {
      console.error('Error getting categories:', error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the connection open for the async response
  }
  
  // Get categories for a specific repository
  if (message.action === 'getRepositoryCategories') {
    const repoId = message.repoId;
    getRepositoryCategories(repoId).then(categories => {
      console.log(`Sending categories for repository ${repoId}:`, categories);
      sendResponse({ categories: categories });
    }).catch(error => {
      console.error(`Error getting categories for repository ${repoId}:`, error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the connection open for the async response
  }
  
  // Update a repository's category
  if (message.action === 'updateRepositoryCategory') {
    const { repoId, categoryName, isChecked } = message;
    updateRepositoryCategory(repoId, categoryName, isChecked).then(result => {
      console.log(`Category "${categoryName}" ${isChecked ? 'added to' : 'removed from'} repository ${repoId}`);
      sendResponse({ success: true });
    }).catch(error => {
      console.error(`Error updating category for repository ${repoId}:`, error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the connection open for the async response
  }
  
  // Add a new category
  if (message.action === 'addCategory') {
    const { categoryName } = message;
    addCategory(categoryName).then(result => {
      console.log(`New category "${categoryName}" added`);
      sendResponse({ success: true });
    }).catch(error => {
      console.error(`Error adding category "${categoryName}":`, error);
      sendResponse({ error: error.message });
    });
    return true; // Keep the connection open for the async response
  }
  
  // Handle explicit sync to GitHub Gist request from content script
  if (message.action === 'syncCategoriesToGist') {
    console.log('Received request to sync categories to Gist');
    syncToGist().then(success => {
      console.log('Sync to Gist completed with status:', success);
      sendResponse({ success: success });
    }).catch(error => {
      console.error('Error during explicit sync to Gist:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep the connection open for the async response
  }
});

// Function to open the extension popup programmatically
function openExtensionPopup() {
  console.log('Attempting to open extension popup');
  
  try {
    // Try using chrome.action.openPopup() method (Manifest V3)
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup();
      console.log('Opened popup using chrome.action.openPopup()');
      return;
    }
    
    // Fallback: create a notification that opens the popup when clicked
    console.log('Using notification fallback to open popup');
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Better GitHub UX',
      message: 'Click to set categories for this repository',
      priority: 2
    }, function(notificationId) {
      // Store notification ID to track clicks
      activeNotificationId = notificationId;
    });
  } catch (error) {
    console.error('Error opening popup:', error);
  }
}

// Get all categories from storage
async function getCategories() {
  try {
    // Get categories from chrome.storage.local
    const data = await chrome.storage.local.get('categories');
    
    // Check if we have categories data
    if (data.categories) {
      return data.categories;
    }
    
    // If not, get from gist if available
    return getSharedData().then(sharedData => {
      if (sharedData && sharedData.categories) {
        return sharedData.categories;
      }
      
      // Return default categories if no data available
      return [
        { name: 'Favorites', repositories: [] },
        { name: 'Work', repositories: [] },
        { name: 'Personal', repositories: [] }
      ];
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    throw error;
  }
}

// Get categories for a specific repository
async function getRepositoryCategories(repoId) {
  try {
    console.log(`Getting categories for repository: ${repoId}`);
    
    // Convert repoId to string for consistent comparison
    const repoIdStr = repoId.toString();
    
    // Start with empty categories array
    let repoCategories = [];
    
    // Get categories from storage
    const categories = await getCategories();
    
    // First check the new format (preferred)
    if (Array.isArray(categories)) {
      categories.forEach(category => {
        if (category.repositories && Array.isArray(category.repositories)) {
          // Check if this category contains the repository
          const hasRepo = category.repositories.some(repo => {
            // Handle different possible formats of the repository ID
            const id = repo.id || repo.repoId;
            return id && id.toString() === repoIdStr;
          });
          
          if (hasRepo && !repoCategories.includes(category.name)) {
            repoCategories.push(category.name);
          }
        }
      });
    }
    
    // Also check the old itemCategories format that might be in storage
    try {
      const itemCategoriesData = await chrome.storage.local.get('itemCategories');
      if (itemCategoriesData.itemCategories && 
          typeof itemCategoriesData.itemCategories === 'object' && 
          itemCategoriesData.itemCategories[repoIdStr]) {
        
        // Add categories from the old format that weren't already found
        itemCategoriesData.itemCategories[repoIdStr].forEach(categoryName => {
          if (!repoCategories.includes(categoryName)) {
            repoCategories.push(categoryName);
          }
        });
      }
    } catch (oldFormatError) {
      console.warn('Error checking old format categories:', oldFormatError);
      // Continue with the categories we already found
    }
    
    console.log(`Found categories for repository ${repoId}:`, repoCategories);
    return repoCategories;
  } catch (error) {
    console.error('Error getting repository categories:', error);
    // Return empty array instead of throwing error for more resilience
    return [];
  }
}

// Update a repository's category
async function updateRepositoryCategory(repoId, categoryName, isChecked) {
  try {
    console.log(`Updating repository ${repoId} category "${categoryName}" to ${isChecked ? 'checked' : 'unchecked'}`);
    
    // Convert repoId to string for consistent comparison
    const repoIdStr = repoId.toString();
    
    // Get current categories data
    const categories = await getCategories();
    
    // Find the category
    const categoryIndex = categories.findIndex(cat => cat.name === categoryName);
    
    if (categoryIndex === -1) {
      throw new Error(`Category "${categoryName}" not found`);
    }
    
    // Make sure repositories array exists
    if (!categories[categoryIndex].repositories) {
      categories[categoryIndex].repositories = [];
    }
    
    // Use consistent ID format
    const repoIdObj = { id: repoIdStr };
    
    if (isChecked) {
      // Add repository to category if not already in it
      if (!categories[categoryIndex].repositories.some(repo => {
        const id = repo.id ? repo.id.toString() : null;
        return id === repoIdStr;
      })) {
        categories[categoryIndex].repositories.push(repoIdObj);
      }
    } else {
      // Remove repository from category
      categories[categoryIndex].repositories = categories[categoryIndex].repositories
        .filter(repo => {
          const id = repo.id ? repo.id.toString() : null;
          return id !== repoIdStr;
        });
    }
    
    // Save updated categories
    await chrome.storage.local.set({ categories: categories });
    
    // Also update the old format for compatibility
    try {
      const itemCategoriesData = await chrome.storage.local.get('itemCategories');
      let itemCategories = itemCategoriesData.itemCategories || {};
      
      if (!itemCategories[repoIdStr]) {
        itemCategories[repoIdStr] = [];
      }
      
      if (isChecked) {
        // Add category to repository if not already there
        if (!itemCategories[repoIdStr].includes(categoryName)) {
          itemCategories[repoIdStr].push(categoryName);
        }
      } else {
        // Remove category from repository
        itemCategories[repoIdStr] = itemCategories[repoIdStr].filter(cat => cat !== categoryName);
      }
      
      await chrome.storage.local.set({ itemCategories: itemCategories });
    } catch (oldFormatError) {
      console.warn('Error updating old format categories:', oldFormatError);
      // Continue with the new format, which is primary
    }
    
    // Sync to GitHub Gist if enabled
    try {
      await syncToGist();
    } catch (syncError) {
      console.warn('Error syncing to Gist, but category was updated locally:', syncError);
      // Don't fail the operation if just the sync fails
    }
    
    return true;
  } catch (error) {
    console.error('Error updating repository category:', error);
    throw error;
  }
}

// Add a new category
async function addCategory(categoryName) {
  try {
    // Get current categories
    const categories = await getCategories();
    
    // Check if category already exists
    if (categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
      throw new Error(`Category "${categoryName}" already exists`);
    }
    
    // Add new category
    categories.push({
      name: categoryName,
      repositories: []
    });
    
    // Save updated categories
    await chrome.storage.local.set({ categories: categories });
    
    // Sync to GitHub Gist if enabled
    syncToGist();
    
    return true;
  } catch (error) {
    console.error('Error adding category:', error);
    throw error;
  }
}

// Try to sync through the popup if it's open
async function tryPopupSync() {
  return new Promise(resolve => {
    // Set a timeout to resolve false if no response within 1 second
    const timeout = setTimeout(() => {
      console.log('Popup sync timed out');
      resolve(false);
    }, 1000);
    
    // Try to send a message to the popup
    chrome.runtime.sendMessage({ action: 'syncCategoriesData' }, response => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        console.log('No active popup to handle sync:', chrome.runtime.lastError);
        resolve(false);
      } else if (response && response.success) {
        console.log('Popup handled sync successfully');
        resolve(true);
      } else {
        console.log('Popup sync request failed or returned false');
        resolve(false);
      }
    });
  });
}

// Sync data to GitHub Gist (if available)
async function syncToGist() {
  console.log('Starting Gist sync process');
  
  try {
    // Try to reach popup to handle the sync if it's open
    const popupSyncAttempt = await tryPopupSync();
    
    if (popupSyncAttempt) {
      console.log('Sync handled by popup');
      return true;
    }
    
    // If popup sync failed or popup is not open, try direct sync
    console.log('Popup sync unsuccessful, attempting direct sync');
    
    // Collect token from all possible storage locations
    const token = await getAccessTokenFromAllSources();
    
    if (!token) {
      console.error('No access token available for direct Gist sync');
      return false;
    }
    
    return await performGistSync(token);
  } catch (error) {
    console.error('Error in syncToGist:', error);
    return false;
  }
}

// New comprehensive function to get access token from all possible sources
async function getAccessTokenFromAllSources() {
  console.log('Attempting to retrieve access token from all sources');
  
  try {
    // Try each storage location in sequence, from most to least likely
    
    // 1. Try local storage (primary location)
    const localData = await chrome.storage.local.get('accessToken');
    if (localData.accessToken) {
      console.log('Found access token in local storage');
      return localData.accessToken;
    }
    
    // 2. Try session storage if available (for current session)
    if (chrome.storage.session) {
      const sessionData = await chrome.storage.session.get('accessToken');
      if (sessionData.accessToken) {
        console.log('Found access token in session storage');
        // Save to local storage for future use
        await chrome.storage.local.set({ accessToken: sessionData.accessToken });
        return sessionData.accessToken;
      }
    }
    
    // 3. Try older token name (for backward compatibility)
    const oldTokenData = await chrome.storage.local.get('github_token');
    if (oldTokenData.github_token) {
      console.log('Found access token under legacy name (github_token)');
      // Save under the new key name for future use
      await chrome.storage.local.set({ accessToken: oldTokenData.github_token });
      return oldTokenData.github_token;
    }
    
    // 4. Last resort, try sync storage (though we typically don't store the token here)
    const syncData = await chrome.storage.sync.get('accessToken');
    if (syncData.accessToken) {
      console.log('Found access token in sync storage');
      // Save to local storage for future use
      await chrome.storage.local.set({ accessToken: syncData.accessToken });
      return syncData.accessToken;
    }
    
    console.log('Could not find access token in any storage location');
    return null;
  } catch (error) {
    console.error('Error while retrieving access token:', error);
    return null;
  }
}

// Perform the actual Gist sync with a valid token
async function performGistSync(accessToken) {
  try {
    console.log('Performing Gist sync with token');
    
    // Get the Gist ID
    const gistData = await chrome.storage.sync.get('categoriesGistId');
    if (!gistData.categoriesGistId) {
      console.error('No Gist ID available for sync');
      return false;
    }
    
    // Get categories data
    const categoriesData = await chrome.storage.local.get('categories');
    const categories = categoriesData.categories || await getCategories();
    
    if (!categories || !Array.isArray(categories)) {
      console.error('No valid categories data available for sync');
      return false;
    }
    
    // Get language preference if available
    const langData = await chrome.storage.local.get('language');
    const language = langData.language || null;
    
    // Create the data structure to save
    const dataToSave = {
      categories: categories,
      lastUpdated: new Date().toISOString(),
      language: language
    };
    
    // Save to Gist
    await updateGist(gistData.categoriesGistId, dataToSave, accessToken);
    
    console.log('Direct Gist sync completed successfully');
    return true;
  } catch (error) {
    console.error('Error in performGistSync:', error);
    return false;
  }
}

// Update a Gist directly
async function updateGist(gistId, data, accessToken) {
  const CATEGORIES_GIST_FILENAME = 'better-github-ux.json';
  
  console.log('Updating Gist directly:', gistId);
  
  const response = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({
      files: {
        [CATEGORIES_GIST_FILENAME]: {
          content: JSON.stringify(data, null, 2)
        }
      }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to update Gist: ${response.status} ${response.statusText}`);
  }
  
  return await response.json();
}

// Get shared data from GitHub Gist (if available)
async function getSharedData() {
  // This function would retrieve data from a GitHub Gist
  // For now, just return null as a placeholder
  return null;
}

// Store active notification ID
let activeNotificationId = null;

// Listen for notification clicks
chrome.notifications.onClicked.addListener(function(notificationId) {
  if (notificationId === activeNotificationId) {
    // Open the extension popup when notification is clicked
    chrome.action.openPopup();
    // Clear the notification
    chrome.notifications.clear(notificationId);
    activeNotificationId = null;
  }
});

// Clear temporary data when the popup is closed
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'popup') {
    console.log('Popup connected');
    port.onDisconnect.addListener(() => {
      console.log('Popup closed, clearing temporary data');
      tempRepoData = null;
    });
  }
}); 