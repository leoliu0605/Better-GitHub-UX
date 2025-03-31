// Better GitHub UX - Content Script
// This script injects custom category buttons on GitHub repository pages

(() => {
  console.log('Better GitHub UX content script loaded');
  
  // Constants
  const EXTENSION_ID = chrome.runtime.id;
  
  // Extension connection status
  let extensionConnected = true;
  
  // Listen for extension disconnect (only if the API is available)
  if (chrome.runtime.onDisconnect) {
    chrome.runtime.onDisconnect.addListener(() => {
      console.log('Disconnected from extension');
      extensionConnected = false;
    });
  }
  
  // Run when content script loads - don't wait for DOMContentLoaded
  initExtension();
  
  // Also run when navigating between pages without a full page reload (GitHub is a SPA)
  observePageChanges();

  // Main initialization function
  function initExtension() {
    console.log('Better GitHub UX: initializing content script');
    console.log('Current URL:', window.location.href);
    
    // Add category buttons to repositories - try immediately
    injectCategoryButtons();
    
    // Also try after a short delay to ensure DOM is fully loaded
    setTimeout(() => {
      console.log('Delayed injection attempt');
      injectCategoryButtons();
    }, 1000);
  }
  
  // Function to check extension connection and show a toast if disconnected
  function checkExtensionConnection() {
    try {
      // Simply touching chrome.runtime.id will throw if disconnected
      const id = chrome.runtime.id;
      if (!extensionConnected) {
        console.log('Extension reconnected');
        extensionConnected = true;
      }
      return true;
    } catch (e) {
      console.warn('Extension context invalidated, showing message');
      extensionConnected = false;
      showToast('Extension was reloaded. Please refresh this page to reconnect.', 'info');
      return false;
    }
  }
  
  // Function to inject category buttons
  function injectCategoryButtons() {
    // Check if we're on a GitHub repositories tab page
    if (isRepositoriesTab()) {
      console.log('Better GitHub UX: Detected repositories tab, injecting category buttons');
      
      // Try the exact selector from the user query first
      const exactSelector = 'div[data-view-component="true"].unstarred.BtnGroup';
      const exactMatches = document.querySelectorAll(exactSelector);
      console.log(`Exact button selector "${exactSelector}" found ${exactMatches.length} items`);
      
      if (exactMatches.length > 0) {
        console.log('Using exact selectors from user query');
        exactMatches.forEach((btnGroup, index) => {
          console.log(`Processing exact match ${index+1}`);
          
          // Get the repository item container (first parent list item or box)
          const repoItem = btnGroup.closest('li') || btnGroup.closest('.Box-row');
          
          if (repoItem && !repoItem.querySelector('.bghub-category-btn')) {
            try {
              const repoInfo = getRepoInfoFromStarForm(btnGroup, repoItem);
              console.log('Repository info from star form:', repoInfo);
              addCategoryButton(btnGroup, repoInfo);
              console.log(`Added category button to exact match ${index+1}`);
            } catch (err) {
              console.error('Error adding category button to exact match:', err);
            }
          }
        });
        return; // If we found and processed exact matches, we're done
      }
      
      // Find all repository items that need category buttons using multiple selectors to increase chances of finding them
      const selectors = [
        'li[itemprop="owns"] div.d-flex', // Your own repos
        'li.source div.d-flex', // Another common class for repos
        'li.public div.d-flex', // Public repos
        'li.private div.d-flex', // Private repos
        'li[data-hpc] div.d-flex.width-full', // Generic selector
        'li.col-12.d-flex', // Another common pattern
        'div.Box ul li div.d-flex' // More generic box-based selector
      ];
      
      // Try each selector
      let repoItems = [];
      for (const selector of selectors) {
        const items = document.querySelectorAll(selector);
        console.log(`Selector "${selector}" found ${items.length} items`);
        if (items.length > 0) {
          repoItems = [...items];
          break;
        }
      }
      
      console.log(`Found ${repoItems.length} repository items`);
      
      // If no items found with selectors, try a more generic approach
      if (repoItems.length === 0) {
        console.log('No repositories found with specific selectors, trying generic approach');
        
        // Find all list items that might be repositories
        const allListItems = document.querySelectorAll('li');
        console.log(`Found ${allListItems.length} list items in total`);
        
        // Filter to those that look like repositories
        repoItems = [...allListItems].filter(item => {
          return item.querySelector('a[href*="/"]') && 
                 (item.querySelector('.f4') || 
                  item.querySelector('h3') || 
                  item.querySelector('div.d-flex'));
        });
        
        console.log(`Filtered to ${repoItems.length} potential repository items`);
      }
      
      // Process each repository item
      repoItems.forEach((repoItem, index) => {
        console.log(`Processing repo item ${index+1}`);
        
        // Find star/unstar buttons container - try different selectors
        const buttonSelectors = [
          'div.unstarred.BtnGroup',
          'div.starred.BtnGroup',
          'div[data-view-component="true"].BtnGroup',
          'form.js-social-form',
          'div.d-flex > div.unstarred',
          'div.d-flex > div.starred'
        ];
        
        let actionButtons = null;
        for (const selector of buttonSelectors) {
          const buttons = repoItem.querySelector(selector);
          if (buttons) {
            actionButtons = buttons;
            console.log(`Found buttons with selector: ${selector}`);
            break;
          }
        }
        
        // If we found action buttons and haven't already added our category button
        if (actionButtons && !repoItem.querySelector('.bghub-category-btn')) {
          try {
            const repoInfo = getRepoInfo(repoItem);
            console.log('Repository info:', repoInfo);
            addCategoryButton(actionButtons, repoInfo);
            console.log(`Added category button to repo ${index+1}`);
          } catch (err) {
            console.error('Error adding category button:', err);
          }
        } else if (!actionButtons) {
          console.log(`No action buttons found for repo ${index+1}`);
        } else {
          console.log(`Category button already exists for repo ${index+1}`);
        }
      });
      
      if (repoItems.length === 0) {
        console.log('HTML structure of the page:', document.body.innerHTML.substring(0, 500));
      }
    } else {
      console.log('Not on repositories tab, current URL:', window.location.href);
    }
  }
  
  // Check if we're on the GitHub repositories tab
  function isRepositoriesTab() {
    const url = window.location.href;
    
    // Multiple patterns to detect repository pages
    const patterns = [
      /github\.com\/[^\/]+\?tab=repositories/, // Standard repos tab
      /github\.com\/[^\/]+\/repositories/, // Alternative format
      /github\.com\/[^\/]+$/, // Profile page which might show repos
      /github\.com\/dashboard/ // Dashboard page which shows repos
    ];
    
    for (const pattern of patterns) {
      if (pattern.test(url)) {
        console.log(`URL matches pattern: ${pattern}`);
        return true;
      }
    }
    
    // Additional checks based on page content
    if (document.querySelector('nav.UnderlineNav a[href$="?tab=repositories"].selected') ||
        document.querySelector('a.UnderlineNav-item[href$="?tab=repositories"][aria-current="page"]')) {
      console.log('Found repositories tab navigation element');
      return true;
    }
    
    // Look for repository heading
    if (document.querySelector('h2:contains("Repositories")') ||
        document.querySelector('h3:contains("Repositories")') ||
        document.querySelector('span:contains("Repositories")')) {
      console.log('Found "Repositories" heading');
      return true;
    }
    
    return false;
  }
  
  // Get repository information from the star button form
  function getRepoInfoFromStarForm(btnGroup, repoItem) {
    // Try to get info from the star form
    const starForm = btnGroup.querySelector('form.js-social-form');
    let repoId, repoName, repoUrl, ownerName, repoShortName;
    
    if (starForm) {
      console.log('Found star form:', starForm);
      // Extract info from form action
      const action = starForm.getAttribute('action');
      console.log('Form action:', action);
      
      if (action) {
        const actionParts = action.split('/').filter(part => part.length > 0);
        
        if (actionParts.length >= 3) {
          ownerName = actionParts[0];
          repoShortName = actionParts[1];
          repoName = `${ownerName}/${repoShortName}`;
          repoUrl = `/${ownerName}/${repoShortName}`;
          console.log(`Extracted from form action: ${repoName}`);
        }
      }
      
      // Try to get repository ID from form input or data attributes
      const idInput = starForm.querySelector('input[name="repository_id"]');
      if (idInput) {
        repoId = idInput.value;
        console.log(`Found repository ID from input: ${repoId}`);
      } else {
        // Try to get from hydro-click data
        const starButton = starForm.querySelector('button[data-hydro-click]');
        if (starButton) {
          try {
            const hydroData = JSON.parse(starButton.getAttribute('data-hydro-click'));
            if (hydroData && hydroData.payload && hydroData.payload.repository_id) {
              repoId = hydroData.payload.repository_id;
              console.log(`Found repository ID from hydro data: ${repoId}`);
            }
          } catch (e) {
            console.log('Could not parse hydro data');
          }
        }
      }
    }
    
    // If we still don't have a name, try to get it from the repo item
    if (!repoName) {
      const nameLink = repoItem.querySelector('a[href*="/"]');
      if (nameLink) {
        repoName = nameLink.textContent.trim();
        repoUrl = nameLink.getAttribute('href');
        
        if (repoUrl) {
          const urlParts = repoUrl.split('/').filter(part => part.length > 0);
          if (urlParts.length >= 2) {
            ownerName = urlParts[0];
            repoShortName = urlParts[1];
          }
        }
      }
    }
    
    return {
      id: repoId || `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      fullName: repoName || 'Unknown Repository',
      shortName: repoShortName || '',
      owner: ownerName || '',
      url: repoUrl || ''
    };
  }
  
  // Get repository information from a repository item element
  function getRepoInfo(repoItem) {
    // Try multiple selector patterns to get repository info
    let repoLink, repoId, repoName, repoUrl;
    
    // Try different selectors for repository links
    const linkSelectors = [
      'a[itemprop="name codeRepository"]',
      'a[href*="/"]',
      'h3 a',
      '.f4 a',
      'a.text-bold'
    ];
    
    for (const selector of linkSelectors) {
      repoLink = repoItem.querySelector(selector);
      if (repoLink) {
        console.log(`Found repo link with selector: ${selector}`);
        break;
      }
    }
    
    // Try different approaches to get repository ID
    const idSelectors = [
      '[data-repository-id]',
      '[data-repo-id]',
      'form[action*="/star"]', // Star form usually has repo info
      'a[data-hydro-click]' // Hydro data often contains repo ID
    ];
    
    let repoIdElement = null;
    for (const selector of idSelectors) {
      repoIdElement = repoItem.querySelector(selector) || 
                      repoItem.closest(selector) ||
                      document.querySelector(selector);
      if (repoIdElement) {
        console.log(`Found repo ID element with selector: ${selector}`);
        break;
      }
    }
    
    // Extract repository ID
    if (repoIdElement) {
      repoId = repoIdElement.getAttribute('data-repository-id') || 
               repoIdElement.getAttribute('data-repo-id');
      
      // If we still don't have ID, try to extract from form action or other attributes
      if (!repoId && repoIdElement.getAttribute('action')) {
        const actionPath = repoIdElement.getAttribute('action');
        const matches = actionPath.match(/\/([^\/]+)\/([^\/]+)\/(star|unstar)/);
        if (matches && matches.length >= 3) {
          console.log('Extracted repo info from form action');
          repoName = `${matches[1]}/${matches[2]}`;
        }
      }
      
      // Try to extract from data-hydro-click JSON
      if (!repoId && repoIdElement.getAttribute('data-hydro-click')) {
        try {
          const hydroData = JSON.parse(repoIdElement.getAttribute('data-hydro-click'));
          if (hydroData && hydroData.payload && hydroData.payload.repository_id) {
            repoId = hydroData.payload.repository_id;
            console.log('Extracted repo ID from hydro data:', repoId);
          }
        } catch (e) {
          console.log('Could not parse hydro data');
        }
      }
    }
    
    // Get repository name and URL
    if (repoLink) {
      repoName = repoName || repoLink.textContent.trim();
      repoUrl = repoLink.getAttribute('href');
    }
    
    // If we have URL but no ID, extract a fallback ID from the URL
    if (repoUrl && !repoId) {
      const urlParts = repoUrl.split('/').filter(part => part.length > 0);
      if (urlParts.length >= 2) {
        const owner = urlParts[urlParts.length - 2];
        const repo = urlParts[urlParts.length - 1];
        repoId = `${owner}/${repo}`;
        console.log('Created fallback ID from URL:', repoId);
      }
    }
    
    const ownerName = repoUrl ? repoUrl.split('/').filter(part => part.length > 0)[0] : '';
    const repoShortName = repoUrl ? repoUrl.split('/').filter(part => part.length > 0)[1] : '';
    
    return {
      id: repoId || `fallback-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      fullName: repoName,
      shortName: repoShortName || (repoName ? repoName.split('/').pop() : ''),
      owner: ownerName || (repoName ? repoName.split('/')[0] : ''),
      url: repoUrl
    };
  }
  
  // Add a category button to a repository's action buttons
  function addCategoryButton(buttonsContainer, repoInfo) {
    // Create button container
    const categoryBtnContainer = document.createElement('div');
    categoryBtnContainer.className = 'BtnGroup-parent bghub-category-btn';
    categoryBtnContainer.style.marginLeft = '4px';
    
    // Create the button - match GitHub's style with rounded corners
    const categoryBtn = document.createElement('button');
    categoryBtn.className = 'btn btn-sm BtnGroup-item';
    categoryBtn.setAttribute('aria-label', 'Set categories for this repository');
    categoryBtn.setAttribute('data-repo-id', repoInfo.id);
    categoryBtn.setAttribute('data-repo-name', repoInfo.fullName);
    categoryBtn.style.borderRadius = '6px';
    categoryBtn.innerHTML = `
      <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-tag d-inline-block mr-2">
        <path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"></path>
      </svg>
      <span class="d-inline">Categories</span>
    `;
    
    // Add click event listener to toggle categories UI instead of opening extension popup
    categoryBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      toggleCategoriesUI(repoInfo, categoryBtnContainer);
    });
    
    // Add button to the container
    categoryBtnContainer.appendChild(categoryBtn);
    
    // Insert after the star/unstar buttons
    try {
      buttonsContainer.insertAdjacentElement('afterend', categoryBtnContainer);
      console.log('Category button added successfully');
    } catch (err) {
      console.error('Error inserting button:', err);
      // Fallback: try appending to parent
      try {
        const parent = buttonsContainer.parentElement;
        parent.appendChild(categoryBtnContainer);
        console.log('Category button added to parent as fallback');
      } catch (parentErr) {
        console.error('Failed to add button to parent:', parentErr);
      }
    }
  }
  
  // Create and toggle the inline categories UI
  async function toggleCategoriesUI(repoInfo, containerElement) {
    console.log('Toggling categories UI for repository:', repoInfo);
    
    // Check if the UI is already open
    let categoriesUI = document.querySelector(`.bghub-categories-ui[data-repo-id="${repoInfo.id}"]`);
    
    if (categoriesUI) {
      // If UI exists, toggle visibility
      if (categoriesUI.style.display === 'none') {
        categoriesUI.style.display = 'block';
        positionDropdown(categoriesUI, containerElement);
        
        // Add the global click handler when showing the dropdown
        addGlobalClickHandler(categoriesUI, containerElement);
      } else {
        categoriesUI.style.display = 'none';
      }
      return;
    }
    
    // Create categories UI - match GitHub's Lists dropdown style
    categoriesUI = document.createElement('div');
    categoriesUI.className = 'bghub-categories-ui SelectMenu';
    categoriesUI.setAttribute('data-repo-id', repoInfo.id);
    categoriesUI.style.position = 'absolute';
    categoriesUI.style.zIndex = '100';
    categoriesUI.style.top = '100%';  // Default position below the button
    categoriesUI.style.left = '0';    // Align with the left edge of the container
    categoriesUI.style.marginTop = '5px'; // Add some spacing below the button
    categoriesUI.style.width = '300px';
    categoriesUI.style.maxHeight = '480px';
    categoriesUI.style.overflow = 'visible';
    categoriesUI.style.boxShadow = 'var(--color-shadow-large)'; // Add shadow for better separation
    categoriesUI.style.border = '1px solid var(--color-border-default)'; // Add border
    categoriesUI.style.borderRadius = '6px'; // Rounded corners
    categoriesUI.style.backgroundColor = 'var(--color-canvas-overlay)'; // Use GitHub's dropdown background color
    categoriesUI.style.color = 'var(--color-fg-default)'; // Use GitHub's default text color
    
    // Create SelectMenu modal following GitHub's structure
    categoriesUI.innerHTML = `
      <div class="SelectMenu-modal">
        <header class="SelectMenu-header">
          <h4 class="SelectMenu-title" style="margin-top: 0; margin-bottom: 0;">Categories</h4>
          <button class="SelectMenu-closeButton" type="button" aria-label="Close menu">
            <svg aria-hidden="true" height="16" viewBox="0 0 16 16" version="1.1" width="16" class="octicon octicon-x">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
            </svg>
          </button>
        </header>
        <div class="SelectMenu-list">
          <div class="bghub-categories-loading p-3 text-center">
            <svg style="box-sizing: content-box; color: var(--color-icon-primary);" width="32" height="32" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="anim-rotate">
              <circle cx="8" cy="8" r="7" stroke="currentColor" stroke-opacity="0.25" stroke-width="2" vector-effect="non-scaling-stroke" fill="none"></circle>
              <path d="M15 8a7.002 7.002 0 00-7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
            </svg>
            <p class="mt-2 color-fg-muted">Loading categories...</p>
          </div>
        </div>
      </div>
    `;
    
    // Position the UI relative to the button container
    containerElement.style.position = 'relative';
    containerElement.appendChild(categoriesUI);
    
    // Position the dropdown properly
    positionDropdown(categoriesUI, containerElement);
    
    // Add close button handler
    const closeButton = categoriesUI.querySelector('.SelectMenu-closeButton');
    closeButton.addEventListener('click', () => {
      categoriesUI.style.display = 'none';
    });
    
    // Add the global click handler
    addGlobalClickHandler(categoriesUI, containerElement);
    
    // Load categories data from storage
    const categories = await loadCategories();
    const repoCategories = await getRepositoryCategories(repoInfo.id);
    
    // Update UI with categories
    updateCategoriesUI(categoriesUI, repoInfo, categories, repoCategories);
  }
  
  // Function to add a global click handler to close the dropdown when clicking outside
  function addGlobalClickHandler(categoriesUI, containerElement) {
    // Remove any existing handler first
    document.removeEventListener('mousedown', categoriesUI._clickOutsideHandler);
    
    // Create a handler function and store reference to it for later removal
    categoriesUI._clickOutsideHandler = (e) => {
      // Get the associated button element
      const categoryButton = containerElement.querySelector('.bghub-category-btn button');
      
      // Check if the click is outside both the dropdown and the button
      if (
        categoriesUI && 
        categoriesUI.style.display !== 'none' &&
        !categoriesUI.contains(e.target) && 
        (!categoryButton || !categoryButton.contains(e.target))
      ) {
        console.log('Click outside detected, closing dropdown');
        categoriesUI.style.display = 'none';
        
        // Clean up the event listener after closing
        document.removeEventListener('mousedown', categoriesUI._clickOutsideHandler);
        delete categoriesUI._clickOutsideHandler;
      }
    };
    
    // Use mousedown instead of click for better responsiveness
    document.addEventListener('mousedown', categoriesUI._clickOutsideHandler);
  }
  
  // Helper function to position the dropdown optimally
  function positionDropdown(dropdown, buttonContainer) {
    // First make sure the dropdown is visible to calculate its height
    dropdown.style.visibility = 'hidden';
    dropdown.style.display = 'block';
    
    // Get needed dimensions and positions
    const dropdownRect = dropdown.getBoundingClientRect();
    const buttonRect = buttonContainer.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - buttonRect.bottom;
    const spaceAbove = buttonRect.top;
    const dropdownHeight = dropdownRect.height;
    
    // Determine if the dropdown fits below
    if (spaceBelow >= dropdownHeight + 5) {
      // Position below the button (default)
      dropdown.style.top = '100%';
      dropdown.style.bottom = 'auto';
      dropdown.style.marginTop = '5px';
      dropdown.style.marginBottom = '0';
    } else if (spaceAbove >= dropdownHeight + 5) {
      // Position above the button if more space there
      dropdown.style.bottom = '100%';
      dropdown.style.top = 'auto';
      dropdown.style.marginBottom = '5px';
      dropdown.style.marginTop = '0';
    } else {
      // Not enough space above or below - position where there's more space
      // and constrain the height
      if (spaceBelow >= spaceAbove) {
        // Use space below
        dropdown.style.top = '100%';
        dropdown.style.bottom = 'auto';
        dropdown.style.marginTop = '5px';
        dropdown.style.marginBottom = '0';
        dropdown.style.maxHeight = `${spaceBelow - 10}px`;
      } else {
        // Use space above
        dropdown.style.bottom = '100%';
        dropdown.style.top = 'auto';
        dropdown.style.marginBottom = '5px';
        dropdown.style.marginTop = '0';
        dropdown.style.maxHeight = `${spaceAbove - 10}px`;
      }
    }
    
    // Handle horizontal positioning to avoid going off-screen
    const viewportWidth = window.innerWidth;
    const potentialRightEdge = buttonRect.left + dropdownRect.width;
    
    if (potentialRightEdge > viewportWidth - 10) {
      // Align right edge of dropdown with right edge of button container
      dropdown.style.left = 'auto';
      dropdown.style.right = '0';
    }
    
    // Make dropdown visible again
    dropdown.style.visibility = 'visible';
  }
  
  // Load categories from storage
  async function loadCategories() {
    try {
      // Check extension connection first
      if (!checkExtensionConnection()) {
        // Return default categories as fallback
        return [
          { name: 'Favorites', repositories: [] },
          { name: 'Work', repositories: [] },
          { name: 'Personal', repositories: [] }
        ];
      }
      
      // Try to get categories from extension storage
      const data = await sendMessageToExtensionPromise({
        action: 'getCategories'
      });
      
      if (data && data.categories) {
        return data.categories;
      }
      
      // Fallback to default categories if no data returned
      return [
        { name: 'Favorites', repositories: [] },
        { name: 'Work', repositories: [] },
        { name: 'Personal', repositories: [] }
      ];
    } catch (error) {
      console.error('Error loading categories:', error);
      
      // Handle extension context invalidation specifically
      if (error.message && error.message.includes('Extension context invalidated')) {
        extensionConnected = false;
        showToast('Extension was reloaded. Please refresh this page for changes to take effect.', 'info');
      }
      
      // Return default categories as fallback
      return [
        { name: 'Favorites', repositories: [] },
        { name: 'Work', repositories: [] },
        { name: 'Personal', repositories: [] }
      ];
    }
  }
  
  // Get categories for a specific repository
  async function getRepositoryCategories(repoId) {
    try {
      // Check extension connection first
      if (!checkExtensionConnection()) {
        return [];
      }
      
      const data = await sendMessageToExtensionPromise({
        action: 'getRepositoryCategories',
        repoId
      });
      
      if (data && data.categories) {
        return data.categories;
      }
      
      return [];
    } catch (error) {
      console.error('Error getting repository categories:', error);
      
      // Handle extension context invalidation specifically
      if (error.message && error.message.includes('Extension context invalidated')) {
        extensionConnected = false;
        showToast('Extension was reloaded. Please refresh this page for changes to take effect.', 'info');
      }
      
      return [];
    }
  }
  
  // Update repository categories
  async function updateRepositoryCategories(repoId, categoryName, isChecked) {
    try {
      // Check extension connection first
      if (!checkExtensionConnection()) {
        showToast('Cannot update categories: extension disconnected. Please refresh the page.', 'error');
        return false;
      }
      
      const result = await sendMessageToExtensionPromise({
        action: 'updateRepositoryCategory',
        repoId,
        categoryName,
        isChecked
      });
      
      // Trigger Gist sync after successful category update
      if (result && result.success) {
        // Request background script to sync to Gist
        await syncCategoriesToGist();
      }
      
      return result && result.success;
    } catch (error) {
      console.error('Error updating repository categories:', error);
      
      // Handle extension context invalidation specifically
      if (error.message && error.message.includes('Extension context invalidated')) {
        extensionConnected = false;
        showToast('Extension was reloaded. Please refresh this page for changes to take effect.', 'error');
      } else {
        showToast('Failed to update category: ' + (error.message || 'Unknown error'), 'error');
      }
      
      return false;
    }
  }
  
  // Add a new category
  async function addNewCategory(categoryName) {
    try {
      // Check extension connection first
      if (!checkExtensionConnection()) {
        showToast('Cannot add category: extension disconnected. Please refresh the page.', 'error');
        return false;
      }
      
      const result = await sendMessageToExtensionPromise({
        action: 'addCategory',
        categoryName
      });
      
      // Trigger Gist sync after successful category addition
      if (result && result.success) {
        // Request background script to sync to Gist
        await syncCategoriesToGist();
      }
      
      return result && result.success;
    } catch (error) {
      console.error('Error adding new category:', error);
      
      // Handle extension context invalidation specifically
      if (error.message && error.message.includes('Extension context invalidated')) {
        extensionConnected = false;
        showToast('Extension was reloaded. Please refresh this page for changes to take effect.', 'error');
      } else {
        showToast('Failed to add category: ' + (error.message || 'Unknown error'), 'error');
      }
      
      return false;
    }
  }
  
  // Helper function to get access token for GitHub API (needed for direct Gist operations)
  async function getAccessToken() {
    try {
      console.log('Content script attempting to retrieve access token');
      
      // Try to get it from the background script
      const response = await sendMessageToExtensionPromise({
        action: 'getAccessToken'
      });
      
      if (response && response.token) {
        console.log('Successfully retrieved token from background script');
        return response.token;
      } else if (response && response.error) {
        console.warn('Error from background script when retrieving token:', response.error);
      } else {
        console.warn('No token returned from background script');
      }
      
      // If no token was returned, let the user know they might need to open the extension popup
      showToast('Please open the extension popup and login with GitHub first', 'info');
      return null;
    } catch (error) {
      console.error('Error getting access token:', error);
      
      // If extension connection is broken, show a specialized message
      if (error.message && error.message.includes('Extension context invalidated')) {
        showToast('Extension reloaded. Please refresh the page and try again.', 'error');
        extensionConnected = false;
      } else {
        showToast('Cannot get access token. Please open the extension popup and login.', 'error');
      }
      
      return null;
    }
  }
  
  // Trigger a sync to GitHub Gist
  async function syncCategoriesToGist() {
    try {
      // Check extension connection first
      if (!checkExtensionConnection()) {
        showToast('Extension disconnected. Please refresh the page to reconnect.', 'error');
        return false;
      }
      
      console.log('Requesting Gist sync from content script');
      
      // Try to get and share the token first (in case it wasn't shared before)
      try {
        const token = await getAccessToken();
        if (token) {
          // Send the token to the background script
          await sendMessageToExtensionPromise({
            action: 'storeAccessToken',
            token: token
          });
          console.log('Shared token with background script before sync');
        } else {
          console.warn('No token available for sync');
          showToast('GitHub login required for sync. Please open the extension popup.', 'info');
          return false;
        }
      } catch (tokenError) {
        console.warn('Could not get/share token before sync:', tokenError);
        showToast('Token sharing failed. Try reopening the extension popup.', 'error');
        // Continue with sync attempt even if token sharing fails
      }
      
      // Now request the sync
      const result = await sendMessageToExtensionPromise({
        action: 'syncCategoriesToGist'
      });
      
      if (result && result.success) {
        console.log('Gist sync requested successfully');
        showToast('Categories synced to GitHub successfully', 'success');
        return true;
      } else {
        console.warn('Gist sync request returned false or no result:', result);
        if (result && result.error) {
          console.error('Sync error details:', result.error);
          showToast(`Sync failed: ${result.error}`, 'error');
        } else {
          showToast('Sync failed. Check extension permissions.', 'error');
        }
        return false;
      }
    } catch (error) {
      console.error('Error requesting Gist sync:', error);
      
      // Handle extension context invalidation specifically
      if (error.message && error.message.includes('Extension context invalidated')) {
        extensionConnected = false;
        showToast('Extension was reloaded. Please refresh this page for changes to take effect.', 'error');
      } else {
        showToast(`Sync error: ${error.message || 'Unknown error'}`, 'error');
      }
      
      return false;
    }
  }
  
  // Update the categories UI with data
  function updateCategoriesUI(uiElement, repoInfo, categories, repoCategories) {
    // Find the list container
    const listContainer = uiElement.querySelector('.SelectMenu-list');
    
    // Set base styling for SelectMenu-list to match GitHub's style
    listContainer.style.maxHeight = '400px';
    listContainer.style.overflowY = 'auto';
    listContainer.style.padding = '0';
    
    // Style the header to match GitHub's style
    const headerElement = uiElement.querySelector('.SelectMenu-header');
    if (headerElement) {
      headerElement.style.padding = '8px 16px';
      headerElement.style.backgroundColor = 'var(--color-canvas-subtle)';
      headerElement.style.borderBottom = '1px solid var(--color-border-muted)';
    }
    
    // If extension is disconnected, show a message
    if (!extensionConnected) {
      listContainer.innerHTML = `
        <div class="SelectMenu-message">
          <p>Extension disconnected. Please refresh this page to reconnect.</p>
          <button class="btn btn-sm btn-primary mt-2" onclick="window.location.reload()">Refresh Page</button>
        </div>
      `;
      return;
    }
    
    // Prepare content - if no categories, show empty state
    if (!categories || categories.length === 0) {
      listContainer.innerHTML = `
        <div class="SelectMenu-message">
          You don't have any categories yet.
        </div>
        <div class="SelectMenu-item">
          <form class="d-flex flex-items-center">
            <input type="text" class="form-control flex-1 mr-2 bghub-new-category-input" placeholder="New category name">
            <button type="submit" class="btn btn-sm btn-primary bghub-add-category-btn">Add</button>
          </form>
        </div>
      `;
    } else {
      // Build categories list with checkboxes
      let categoriesContent = '';
      
      // Add all categories with checkboxes
      categories.forEach(category => {
        const isChecked = repoCategories.includes(category.name);
        categoriesContent += `
          <label class="SelectMenu-item" style="padding: 8px 16px; cursor: pointer; user-select: none;">
            <input 
              type="checkbox" 
              class="bghub-category-checkbox"
              ${isChecked ? 'checked' : ''} 
              data-category-name="${category.name}"
              style="margin-right: 8px; vertical-align: middle;"
            >
            <span style="vertical-align: middle;">${category.name}</span>
          </label>
        `;
      });
      
      // Add form for new category at the bottom
      categoriesContent += `
        <div class="SelectMenu-divider" style="margin: 8px 0; border-top: 1px solid var(--color-border-muted);"></div>
        <div class="SelectMenu-item" style="padding: 8px 16px;">
          <form class="d-flex flex-items-center">
            <input type="text" class="form-control flex-1 mr-2 bghub-new-category-input" 
                   placeholder="New category name" 
                   style="color: var(--color-fg-default); background-color: var(--color-canvas-subtle); border: 1px solid var(--color-border-default);">
            <button type="submit" class="btn btn-sm btn-primary bghub-add-category-btn">Add</button>
          </form>
        </div>
      `;
      
      // Set the content
      listContainer.innerHTML = categoriesContent;
    }
    
    // Add event listeners for category checkboxes
    const checkboxes = uiElement.querySelectorAll('.bghub-category-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', async (e) => {
        const categoryName = e.target.getAttribute('data-category-name');
        const isChecked = e.target.checked;
        
        console.log(`Toggling category "${categoryName}" to ${isChecked ? 'checked' : 'unchecked'}`);
        
        // Show loading indicator on the checkbox parent
        const label = e.target.closest('label');
        label.style.opacity = '0.6';
        label.style.pointerEvents = 'none';
        e.target.disabled = true;
        
        // Update the category in storage
        const success = await updateRepositoryCategories(repoInfo.id, categoryName, isChecked);
        
        // Reset the styling
        label.style.opacity = '1';
        label.style.pointerEvents = 'auto';
        e.target.disabled = false;
        
        if (!success) {
          // Revert the checkbox if update failed
          e.target.checked = !isChecked;
          showToast('Failed to update category. Please try again.');
        }
      });
    });
    
    // Add event listener for the "Add category" form
    const addCategoryForm = uiElement.querySelector('.bghub-new-category-input')?.closest('form');
    if (addCategoryForm) {
      addCategoryForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const input = e.target.querySelector('.bghub-new-category-input');
        const categoryName = input.value.trim();
        
        if (categoryName === '') {
          showToast('Please enter a category name');
          return;
        }
        
        // Check if category already exists
        const categoryExists = categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase());
        if (categoryExists) {
          showToast('Category already exists');
          return;
        }
        
        // Show loading state
        const addButton = e.target.querySelector('.bghub-add-category-btn');
        const originalButtonText = addButton.textContent;
        addButton.disabled = true;
        addButton.innerHTML = `<span class="bghub-spinner d-inline-block" style="vertical-align: text-bottom; width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: 0.75s linear infinite spinner-border;"></span>`;
        
        // Add the new category
        const success = await addNewCategory(categoryName);
        
        if (success) {
          // Refresh categories data and update UI
          const updatedCategories = await loadCategories();
          const updatedRepoCategories = await getRepositoryCategories(repoInfo.id);
          updateCategoriesUI(uiElement, repoInfo, updatedCategories, updatedRepoCategories);
        } else {
          // Reset button state
          addButton.disabled = false;
          addButton.textContent = originalButtonText;
          showToast('Failed to add category. Please try again.');
        }
      });
    }
  }
  
  // Helper function to make category names safe for use as IDs
  function makeIdSafe(str) {
    return str.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  }
  
  // Show a toast message
  function showToast(message, type = 'error') {
    // Check if toast container exists
    let toastContainer = document.querySelector('.bghub-toast-container');
    
    if (!toastContainer) {
      // Create toast container
      toastContainer = document.createElement('div');
      toastContainer.className = 'bghub-toast-container';
      toastContainer.style.position = 'fixed';
      toastContainer.style.bottom = '20px';
      toastContainer.style.right = '20px';
      toastContainer.style.zIndex = '1000';
      document.body.appendChild(toastContainer);
    }
    
    // Create toast with GitHub theme colors
    const toast = document.createElement('div');
    toast.className = `bghub-toast bghub-toast-${type}`;
    toast.style.padding = '10px 16px';
    toast.style.borderRadius = '6px';
    toast.style.marginTop = '10px';
    toast.style.boxShadow = 'var(--color-shadow-medium)';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.fontSize = '14px';
    
    if (type === 'error') {
      toast.style.backgroundColor = 'var(--color-danger-subtle)';
      toast.style.color = 'var(--color-danger-fg)';
      toast.style.border = '1px solid var(--color-danger-muted)';
    } else if (type === 'success') {
      toast.style.backgroundColor = 'var(--color-success-subtle)';
      toast.style.color = 'var(--color-success-fg)';
      toast.style.border = '1px solid var(--color-success-muted)';
    } else {
      toast.style.backgroundColor = 'var(--color-accent-subtle)';
      toast.style.color = 'var(--color-accent-fg)';
      toast.style.border = '1px solid var(--color-accent-muted)';
    }
    
    // Add message
    toast.textContent = message;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.marginLeft = '10px';
    closeBtn.style.backgroundColor = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = 'inherit';
    closeBtn.style.fontSize = '18px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0 5px';
    closeBtn.onclick = () => {
      toastContainer.removeChild(toast);
    };
    
    toast.appendChild(closeBtn);
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (toast.parentNode === toastContainer) {
        toastContainer.removeChild(toast);
      }
    }, 5000);
  }
  
  // Send message to the extension background script with Promise
  function sendMessageToExtensionPromise(message) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(message, response => {
          // Check for runtime errors (extension context invalidation)
          if (chrome.runtime.lastError) {
            console.error('Error sending message to extension:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          
          // We got a response, so the extension is connected
          extensionConnected = true;
          resolve(response);
        });
      } catch (error) {
        // This catches immediate exceptions like extension context invalidation
        console.error('Exception sending message to extension:', error);
        extensionConnected = false;
        reject(error);
      }
    });
  }
  
  // Observe DOM changes to inject buttons when page content changes (GitHub uses AJAX)
  function observePageChanges() {
    const observer = new MutationObserver((mutations) => {
      let shouldUpdate = false;
      
      // Check each mutation for relevant changes
      mutations.forEach(mutation => {
        // Check if new nodes were added
        if (mutation.addedNodes && mutation.addedNodes.length) {
          // Convert NodeList to Array for easier inspection
          const addedNodes = Array.from(mutation.addedNodes);
          
          // Check if any of the added nodes or their children might be repository items
          shouldUpdate = addedNodes.some(node => {
            // Only process element nodes
            if (node.nodeType !== Node.ELEMENT_NODE) return false;
            
            // Check if node is a repository item or contains repository items
            return (
              // Direct match for repository list item
              node.tagName === 'LI' ||
              // Contains repository items
              node.querySelector?.('li[data-hpc]') ||
              node.querySelector?.('li.public') ||
              node.querySelector?.('li.private') ||
              node.querySelector?.('div.Box ul li') ||
              // General content updates that might include repositories
              node.id === 'user-repositories-list' ||
              (node.className && typeof node.className === 'string' && (
                node.className.includes('repository') ||
                node.className.includes('repo')
              )) ||
              // Navigation changes that might indicate switching to repositories tab
              (node.className && typeof node.className === 'string' && (
                node.className.includes('UnderlineNav') ||
                node.className.includes('js-responsive-underlinenav')
              ))
            );
          });
        }
        
        // Also check for attribute changes on key elements that might indicate tab changes
        if (mutation.type === 'attributes' && 
            ((mutation.target.className && typeof mutation.target.className === 'string' && 
              mutation.target.className.includes('UnderlineNav-item')) ||
             mutation.target.getAttribute('aria-current') === 'page')) {
          shouldUpdate = true;
        }
        
        // Check URL changes
        if (mutation.type === 'attributes' && 
            mutation.target === document.body && 
            mutation.attributeName === 'data-turbo-body') {
          // GitHub's Turbo navigation often sets a data attribute on body when navigating
          shouldUpdate = true;
        }
      });
      
      if (shouldUpdate) {
        console.log('DOM changes detected, injecting category buttons');
        // Give a short delay for DOM to stabilize
        setTimeout(injectCategoryButtons, 500);
      }
    });
    
    // Observe the entire document for changes
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-current', 'data-turbo-body']
    });
    
    console.log('MutationObserver is now watching for DOM changes');
  }
})(); 