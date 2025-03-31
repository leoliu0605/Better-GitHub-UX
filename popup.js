import config from './config.js';
import { initI18n, getMessage, translatePage, createLanguageSwitcher, getCurrentLanguage } from './i18n.js';

// GitHub OAuth configuration
const CLIENT_ID = config.GITHUB_CLIENT_ID;
const REDIRECT_URI = chrome.identity.getRedirectURL();
const SCOPES = ['repo', 'user'];

// State
let accessToken = null;
let currentUserLogin = null;
let currentTab = 'repos'; // 當前選中的頁籤
let repositories = []; // 使用者的儲存庫列表
let stars = []; // 使用者的星標列表

// 項目分類對話框相關狀態
let currentItemId = null;
let currentItemName = null;
let currentItemType = null; // 'repo' 或 'star'

// 分類相關數據
const CATEGORIES_GIST_FILENAME = 'better-github-ux.json';
const CATEGORIES_GIST_DESCRIPTION = 'Better GitHub UX - Categories Data';
let categories = []; // 分類列表，格式：[{name: '分類1', repositories: ['repoId1', 'repoId2']}]
let itemCategories = {}; // 舊格式，僅用於兼容，將被廢棄
let categoriesGistId = null; // 存儲分類數據的 Gist ID
let savedLanguage = null; // 存儲用戶的語言偏好

// DOM Elements
let loginSection;
let userSection;
let loginButton;
let userAvatar;
let username;
let userStats;
let tabButtons;
let tabContents;
let reposList;
let starsList;

// 分類相關元素
let manageCategoriesButton;
let syncCategoriesButton;
let categoriesDropdown;
let categoriesList;
let newCategoryInput;
let addCategoryButton;
let categoryFilterSelect;
let categoryDialog;
let categoryDialogContent;
let saveCategoriesButton;
let cancelCategoriesButton;

// 項目分類對話框相關元素
let itemCategoryDialog;
let itemCategoryTitle;
let itemCategoriesList;
let newQuickCategoryInput;
let addQuickCategoryButton;
let saveItemCategoriesButton;
let cancelItemCategoriesButton;

// 提示訊息容器
let messageContainer;

// 載入中遮罩
let loadingOverlay;

// Language switcher container
let languageSwitcher;

// Variables for handling external repository data
let externalRepoData = null;
let popupPort = null;

// Connect to the background script when the popup is opened
function connectToBackgroundScript() {
  // Create a connection to the background script
  popupPort = chrome.runtime.connect({ name: 'popup' });
  
  // Check if we were opened from a content script
  chrome.runtime.sendMessage({ action: 'getRepositoryData' }, response => {
    if (chrome.runtime.lastError) {
      console.error('Error getting repository data:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.repo) {
      console.log('Received repository data from background script:', response.repo);
      externalRepoData = response.repo;
      
      // Process the external repository
      processExternalRepository();
    }
  });
}

// Process a repository received from external sources (content script)
async function processExternalRepository() {
  if (!externalRepoData || !externalRepoData.id) {
    console.warn('Invalid external repository data');
    return;
  }
  
  // Ensure we're logged in and data is loaded
  if (!accessToken) {
    console.log('Waiting for login before processing external repository');
    // Set up a listener for the login event
    window.addEventListener('logged-in', () => {
      setTimeout(processExternalRepository, 1000); // Wait for data to load
    }, { once: true });
    return;
  }
  
  // Switch to the repositories tab if not already there
  if (currentTab !== 'repos') {
    await switchTab('repos');
  }
  
  console.log('Processing external repository:', externalRepoData);
  
  // Find the repository in our loaded repositories
  const repository = repositories.find(repo => repo.id.toString() === externalRepoData.id.toString());
  
  if (repository) {
    console.log('Found matching repository in loaded data:', repository);
    // Open the category dialog for this repository
    await openCategoryDialog(repository);
  } else {
    console.log('Repository not found in loaded data, retrieving from API');
    
    try {
      // Get the repository data from the GitHub API
      const repoData = await fetchGitHubData(`repos/${externalRepoData.owner}/${externalRepoData.shortName}`);
      
      if (repoData && repoData.id) {
        console.log('Retrieved repository data from API:', repoData);
        // Open the category dialog for this repository
        await openCategoryDialog(repoData);
      } else {
        showMessage('Failed to retrieve repository data', 'error');
      }
    } catch (error) {
      console.error('Error retrieving repository data:', error);
      showMessage('Failed to retrieve repository data', 'error');
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup loaded');
  
  initDomElements();
  
  // Initialize i18n before adding event listeners
  await initI18n();
  
  // Translate the page
  translatePage();
  
  // Create a single fixed language switcher
  document.body.insertAdjacentHTML('beforeend', '<div id="fixed-language-switcher"></div>');
  languageSwitcher = document.getElementById('fixed-language-switcher');
  
  if (languageSwitcher) {
    createLanguageSwitcher(languageSwitcher);
  }
  
  // Listen for language changes
  window.addEventListener('languageChanged', async (e) => {
    // Update UI text
    translatePage();
    
    // Update dynamic content if necessary
    if (currentTab === 'repos' && repositories.length > 0) {
      displayRepositories(repositories);
    } else if (currentTab === 'stars') {
      loadStars();
    }
    
    // Update any tooltips or placeholders
    updateTooltipsAndPlaceholders();
    
    // Save the language preference to Gist
    try {
      await saveCategoriesToGist();
      console.log('Language preference saved to Gist:', e.detail.language);
    } catch (error) {
      console.error('Error saving language preference to Gist:', error);
    }
  });
  
  addEventListeners();
  
  // Initial state - show loading overlay
  showLoading();
  
  await checkLoginStatus();
  
  // Connect to the background script
  connectToBackgroundScript();
});

// Update tooltips and placeholders that might be set programmatically
function updateTooltipsAndPlaceholders() {
  // Example: update dynamic tooltips
  if (manageCategoriesButton) {
    manageCategoriesButton.title = getMessage('manageCategories');
  }
  
  if (syncCategoriesButton) {
    syncCategoriesButton.title = getMessage('syncToGithub');
  }
}

// 初始化 DOM 元素
function initDomElements() {
  loginSection = document.getElementById('login-section');
  userSection = document.getElementById('user-section');
  loginButton = document.getElementById('login-button');
  userAvatar = document.getElementById('user-avatar');
  username = document.getElementById('username');
  userStats = document.getElementById('user-stats');
  tabButtons = document.querySelectorAll('.tab-button');
  tabContents = document.querySelectorAll('.tab-content');
  reposList = document.getElementById('repos-list');
  starsList = document.getElementById('stars-list');
  
  // Top categories dropdown elements
  manageCategoriesButton = document.getElementById('manage-categories-button');
  syncCategoriesButton = document.getElementById('sync-categories-button');
  categoriesDropdown = document.getElementById('categories-dropdown');
  
  // We need to be more specific with these selectors due to duplicate IDs
  // For the top dropdown
  categoriesList = categoriesDropdown.querySelector('#categories-list');
  newCategoryInput = categoriesDropdown.querySelector('#new-category-input');
  addCategoryButton = categoriesDropdown.querySelector('#add-category-button');
  
  // Category filter
  categoryFilterSelect = document.getElementById('category-filter-select');
  
  // Category dialog elements (modal)
  categoryDialog = document.getElementById('category-dialog');
  categoryDialogContent = document.getElementById('category-dialog-content');
  saveCategoriesButton = document.getElementById('save-categories-button');
  cancelCategoriesButton = document.getElementById('cancel-categories-button');
  
  // 項目分類對話框相關元素
  itemCategoryDialog = document.getElementById('item-category-dialog');
  itemCategoryTitle = document.getElementById('item-category-title');
  itemCategoriesList = document.getElementById('item-categories-list');
  newQuickCategoryInput = document.getElementById('new-quick-category-input');
  addQuickCategoryButton = document.getElementById('add-quick-category-button');
  saveItemCategoriesButton = document.getElementById('save-item-categories-button');
  cancelItemCategoriesButton = document.getElementById('cancel-item-categories-button');
  
  // 提示訊息容器
  messageContainer = document.getElementById('message-container');
  
  // 載入中遮罩
  loadingOverlay = document.getElementById('loading-overlay');
  
  console.log('DOM elements initialized');
}

// 添加事件監聽器
function addEventListeners() {
  loginButton.addEventListener('click', handleLogin);
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      switchTab(tab);
    });
  });
  
  manageCategoriesButton.addEventListener('click', () => {
    categoriesDropdown.classList.toggle('hidden');
    if (!categoriesDropdown.classList.contains('hidden')) {
      updateCategoryList();
      if (newCategoryInput) {
        setTimeout(() => {
          newCategoryInput.focus();
        }, 100);
      }
    }
  });
  
  syncCategoriesButton.addEventListener('click', async () => {
    try {
      updateSyncButtonState('syncing');
      showLoading();
      await saveCategoriesToGist();
      updateSyncButtonState('default');
      hideLoading();
    } catch (error) {
      console.error('Sync error:', error);
      updateSyncButtonState('error');
      hideLoading();
      setTimeout(() => {
        updateSyncButtonState('default');
      }, 3000);
    }
  });
  
  // 項目分類對話框按鈕
  saveItemCategoriesButton.addEventListener('click', saveItemCategories);
  cancelItemCategoriesButton.addEventListener('click', closeItemCategoryDialog);
  
  // 快速添加分類按鈕
  addQuickCategoryButton.addEventListener('click', addQuickCategory);
  newQuickCategoryInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addQuickCategory();
    }
  });
  
  console.log('Event listeners added');
}

// 檢查登入狀態
async function checkLoginStatus() {
  try {
    console.log('Checking login status');
    showLoading();
    
    // 從 URL 檢查是否有 code 參數（OAuth 回調）
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    if (code) {
      console.log('Found code in URL, exchanging for token');
      await handleCodeExchange(code);
      return;
    }
    
    // 從 storage 加載 token
    const token = await loadTokenFromStorage();
    
    if (token) {
      console.log('Found token in storage');
      
      // Make sure the token is valid by making a simple API call
      try {
        // Check for access to the GitHub API with this token
        const userData = await fetchGitHubData('user');
        if (userData && userData.login) {
          console.log('Token is valid, showing user section');
          showUserSection();
          await loadUserData();
          return;
        } else {
          console.warn('Token found but API call failed');
          // Token might be invalid, clear it
          accessToken = null;
        }
      } catch (apiError) {
        console.error('Error verifying token:', apiError);
        // Token is likely invalid, clear it
        accessToken = null;
        await chrome.storage.local.remove(['accessToken', 'github_token']);
      }
    }
    
    // 如果沒有 token 或 token 無效，顯示登入畫面
    console.log('No valid token found, showing login section');
    loginSection.classList.remove('hidden');
    userSection.classList.add('hidden');
    hideLoading();
  } catch (error) {
    console.error('Error checking login status:', error);
    loginSection.classList.remove('hidden');
    userSection.classList.add('hidden');
    hideLoading();
  }
}

// 處理 code 交換成 token
async function handleCodeExchange(code) {
  try {
    console.log('Exchanging code for token');
    const token = await exchangeCodeForToken(code);
    accessToken = token;
    await chrome.storage.local.set({ github_token: token });
    showUserSection();
    await loadUserData();
    // 清除 URL 參數
    window.history.replaceState({}, document.title, window.location.pathname);
  } catch (error) {
    console.error('Token exchange error:', error);
    loginButton.textContent = 'Login Failed. Try Again';
    loginButton.disabled = false;
    hideLoading();
  }
}

// 從 storage 載入 token
async function loadTokenFromStorage() {
  try {
    console.log('Attempting to load token from storage');
    
    // Try each storage location in sequence, from most to least likely
    
    // 1. Try local storage with new key name (primary location)
    const localData = await chrome.storage.local.get('accessToken');
    if (localData.accessToken) {
      console.log('Found access token in local storage');
      accessToken = localData.accessToken;
      await shareTokenWithBackgroundScript(accessToken);
      return accessToken;
    }
    
    // 2. Try session storage if available (for current session)
    if (chrome.storage.session) {
      try {
        const sessionData = await chrome.storage.session.get('accessToken');
        if (sessionData.accessToken) {
          console.log('Found access token in session storage');
          // Save to local storage for future use
          await chrome.storage.local.set({ accessToken: sessionData.accessToken });
          accessToken = sessionData.accessToken;
          await shareTokenWithBackgroundScript(accessToken);
          return accessToken;
        }
      } catch (sessionError) {
        console.warn('Error accessing session storage:', sessionError);
      }
    }
    
    // 3. Try older token name (for backward compatibility)
    const oldTokenData = await chrome.storage.local.get('github_token');
    if (oldTokenData.github_token) {
      console.log('Found access token under legacy name (github_token)');
      // Save under the new key name for future use
      await chrome.storage.local.set({ accessToken: oldTokenData.github_token });
      accessToken = oldTokenData.github_token;
      await shareTokenWithBackgroundScript(accessToken);
      return accessToken;
    }
    
    // 4. Last resort, try sync storage (though we typically don't store the token here for security)
    const syncData = await chrome.storage.sync.get('accessToken');
    if (syncData.accessToken) {
      console.log('Found access token in sync storage');
      // Save to local storage for future use
      await chrome.storage.local.set({ accessToken: syncData.accessToken });
      accessToken = syncData.accessToken;
      await shareTokenWithBackgroundScript(accessToken);
      return accessToken;
    }
    
    console.log('No token found in any storage location');
    return null;
  } catch (error) {
    console.error('Error loading token from storage:', error);
    return null;
  }
}

// Helper function to share token with background script
async function shareTokenWithBackgroundScript(token) {
  try {
    if (!token) return false;
    
    await chrome.runtime.sendMessage({
      action: 'storeAccessToken',
      token: token
    });
    console.log('Token shared with background script');
    return true;
  } catch (error) {
    console.warn('Could not share token with background script:', error);
    return false;
  }
}

// 處理登入
async function handleLogin() {
  try {
    // 顯示載入狀態
    loginButton.textContent = 'Connecting...';
    loginButton.disabled = true;
    showLoading();

    // 構建 GitHub OAuth URL
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${SCOPES.join(' ')}`;
    
    // 開啟 GitHub 授權頁面
    const responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({
        url: authUrl,
        interactive: true
      }, (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(redirectUrl);
        }
      });
    });

    // 處理回調
    if (responseUrl) {
      const url = new URL(responseUrl);
      const code = url.searchParams.get('code');
      
      if (code) {
        await handleCodeExchange(code);
      } else {
        throw new Error('No code received');
      }
    }
  } catch (error) {
    console.error('Authentication error:', error);
    loginButton.textContent = 'Login Failed. Try Again';
    loginButton.disabled = false;
    hideLoading();
  }
}

// 顯示使用者區塊
function showUserSection() {
  console.log('Showing user section');
  console.log('Login section element:', loginSection);
  console.log('User section element:', userSection);
  
  if (!loginSection || !userSection) {
    console.error('Cannot find login or user section elements');
    return;
  }
  
  loginSection.classList.add('hidden');
  userSection.classList.remove('hidden');
  
  // 確保初始顯示正確
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  document.getElementById('repos-content').classList.add('active');
  
  console.log('User section shown');
}

// 載入使用者資料
async function loadUserData() {
  try {
    console.log('Loading user data');
    console.log('Access token available:', !!accessToken);
    
    // 獲取使用者資料
    const userData = await fetchGitHubData('user');
    console.log('User data loaded:', userData);
    
    // 確保 userData 不為空
    if (!userData) {
      console.error('User data is empty');
      throw new Error('Failed to load user data');
    }
    
    // 儲存當前使用者登入名稱
    currentUserLogin = userData.login;
    
    // 直接檢查 userData 是否包含必要的字段
    console.log('User avatar URL:', userData.avatar_url);
    console.log('User login:', userData.login);
    
    // 更新頭像
    if (userAvatar && userData.avatar_url) {
      userAvatar.src = userData.avatar_url;
      console.log('Avatar src set to:', userAvatar.src);
    } else {
      console.error('Cannot set avatar:', userAvatar ? 'No avatar URL' : 'No avatar element');
    }
    
    // 更新用戶名
    if (username && userData.login) {
      username.textContent = userData.login;
      console.log('Username set to:', username.textContent);
    } else {
      console.error('Cannot set username:', username ? 'No login data' : 'No username element');
    }
    
    // 載入分類數據
    await loadCategoriesData();
    
    // 如果從 Gist 加載了語言設定，重新初始化 i18n
    if (savedLanguage) {
      console.log('Re-initializing i18n with language from Gist:', savedLanguage);
      await initI18n(savedLanguage);
      
      // 刷新語言選擇器的選中狀態
      document.querySelectorAll('.language-option').forEach(option => {
        option.classList.toggle('active', option.dataset.langCode === savedLanguage);
      });
      
      // 重新翻譯頁面
      translatePage();
    }
    
    // 載入倉庫和星標
    await loadReposAndStats();
    
    // 載入其他資料
    await Promise.all([
      loadStars()
    ]);
    
    // 初始化分類界面
    initCategoriesUI();
    
    console.log('All data loaded successfully');
    hideLoading();
  } catch (error) {
    console.error('Error loading user data:', error);
    
    // 顯示錯誤訊息
    if (username) {
      username.textContent = 'Error loading data';
    }
    
    if (userStats) {
      userStats.innerHTML = '<span class="error-text">Failed to load user data</span>';
    }
    
    hideLoading();
  }
}

// 載入倉庫和統計資料
async function loadReposAndStats() {
  try {
    console.log('Loading repos and stats');
    
    // 獲取使用者資料（需要用戶名來過濾）
    const userData = await fetchGitHubData('user');
    
    // 獲取資料
    const [repos, starredRepos] = await Promise.all([
      fetchGitHubData('user/repos'),
      fetchGitHubData('user/starred')
    ]);
    
    // 過濾出使用者自己擁有的倉庫
    repositories = repos.filter(repo => repo.owner.login === userData.login);
    stars = starredRepos;
    
    console.log('All repos loaded:', repos.length);
    console.log('Owner repos filtered:', repositories.length);
    console.log('Stars loaded:', stars.length);
    
    // 更新統計資訊
    if (userStats) {
      userStats.innerHTML = `
        <span>📦 ${repositories.length} Repositories</span>
        <span>⭐ ${stars.length} Stars</span>
      `;
      console.log('Stats updated');
    }
    
    // 顯示使用者自己擁有的倉庫列表
    displayRepositories(repositories);
  } catch (error) {
    console.error('Error loading repos and stats:', error);
  }
}

// Functions
async function exchangeCodeForToken(code) {
  try {
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: config.GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });

    if (!response.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error('Token exchange error:', error);
    throw error;
  }
}

// 顯示倉庫列表
function displayRepositories(repos) {
  // 清空現有內容
  reposList.innerHTML = '';
  
  if (!repos || repos.length === 0) {
    reposList.innerHTML = `<div class="empty-state">${getMessage('noRepositoriesFound')}</div>`;
    console.log('No repositories to display');
    return;
  }

  console.log('Displaying repositories:', repos.length);
  
  repos.forEach(repo => {
    const repoItem = document.createElement('div');
    repoItem.className = 'repo-item';
    repoItem.dataset.id = repo.id;
    
    // 設置倉庫HTML
    repoItem.innerHTML = `
      <h4>
        ${repo.name}
        <span class="repo-owner">${repo.owner.login === username.textContent ? '' : `(${repo.owner.login})`}</span>
      </h4>
      <p>${repo.description || getMessage('noDescription')}</p>
      <div class="repo-meta">
        <span>⭐ ${repo.stargazers_count}</span>
        <span>🔀 ${repo.forks_count}</span>
        <span>${repo.private ? '🔒 ' + getMessage('private') : '🌐 ' + getMessage('public')}</span>
      </div>
      <div class="category-badges"></div>
      <div class="item-actions">
        <div class="dropdown">
          <button class="category-btn dropdown-toggle" title="${getMessage('manageCategories')}">
            <i class="fas fa-tag"></i>
          </button>
          <div class="dropdown-content">
            <a class="dropdown-item set-categories-action">${getMessage('setCategories')}</a>
            <div class="dropdown-divider"></div>
            ${generateCategoryDropdownItems(repo.id)}
          </div>
        </div>
        <button class="open-btn" title="${getMessage('openInGithub')}"><i class="fas fa-external-link-alt"></i></button>
      </div>
    `;
    
    // 添加分類標籤
    const badgesContainer = repoItem.querySelector('.category-badges');
    updateCategoryBadges(badgesContainer, repo.id);
    
    // 添加事件監聽器
    const dropdownToggle = repoItem.querySelector('.dropdown-toggle');
    const dropdownContent = repoItem.querySelector('.dropdown-content');
    
    // 下拉選單切換
    dropdownToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownContent.classList.toggle('show');
    });
    
    // 設置分類按鈕
    const setCategoriesAction = repoItem.querySelector('.set-categories-action');
    setCategoriesAction.addEventListener('click', () => {
      showItemCategoryDialog(repo.id, repo.name, 'repo');
      dropdownContent.classList.remove('show');
    });
    
    // 快速分類選項
    const categoryItems = repoItem.querySelectorAll('.quick-category-item');
    categoryItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const categoryId = e.target.dataset.categoryName;
        toggleItemCategory(repo.id, categoryId);
        dropdownContent.classList.remove('show');
      });
    });
    
    // 在GitHub中打開
    const openBtn = repoItem.querySelector('.open-btn');
    openBtn.addEventListener('click', () => {
      openInGitHub(repo.html_url);
    });
    
    reposList.appendChild(repoItem);
  });
  
  // 關閉所有打開的下拉選單當點擊頁面其他部分
  document.addEventListener('click', closeAllDropdowns);
  
  // 應用當前分類過濾器
  filterItemsByCategory();
}

// 顯示星標列表
async function loadStars() {
  try {
    const stars = await fetchGitHubData('user/starred');
    
    if (!stars || stars.length === 0) {
      starsList.innerHTML = `<div class="empty-state">${getMessage('noStarsFound')}</div>`;
      return;
    }
    
    // 清空現有內容
    starsList.innerHTML = '';
    
    stars.forEach(star => {
      const starItem = document.createElement('div');
      starItem.className = 'star-item';
      starItem.dataset.id = star.id;
      
      // 設置星標HTML
      starItem.innerHTML = `
        <h4>${star.full_name}</h4>
        <p>${star.description || getMessage('noDescription')}</p>
        <div class="star-meta">
          <span>⭐ ${star.stargazers_count}</span>
          <span>🔀 ${star.forks_count}</span>
          <span>${star.language ? `${star.language}` : ''}</span>
        </div>
        <div class="category-badges"></div>
        <div class="item-actions">
          <div class="dropdown">
            <button class="category-btn dropdown-toggle" title="${getMessage('manageCategories')}">
              <i class="fas fa-tag"></i>
            </button>
            <div class="dropdown-content">
              <a class="dropdown-item set-categories-action">${getMessage('setCategories')}</a>
              <div class="dropdown-divider"></div>
              ${generateCategoryDropdownItems(star.id)}
            </div>
          </div>
          <button class="open-btn" title="${getMessage('openInGithub')}"><i class="fas fa-external-link-alt"></i></button>
        </div>
      `;
      
      // 添加分類標籤
      const badgesContainer = starItem.querySelector('.category-badges');
      updateCategoryBadges(badgesContainer, star.id);
      
      // 添加事件監聽器
      const dropdownToggle = starItem.querySelector('.dropdown-toggle');
      const dropdownContent = starItem.querySelector('.dropdown-content');
      
      // 下拉選單切換
      dropdownToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownContent.classList.toggle('show');
      });
      
      // 設置分類按鈕
      const setCategoriesAction = starItem.querySelector('.set-categories-action');
      setCategoriesAction.addEventListener('click', () => {
        showItemCategoryDialog(star.id, star.full_name, 'star');
        dropdownContent.classList.remove('show');
      });
      
      // 快速分類選項
      const categoryItems = starItem.querySelectorAll('.quick-category-item');
      categoryItems.forEach(item => {
        item.addEventListener('click', (e) => {
          const categoryId = e.target.dataset.categoryName;
          toggleItemCategory(star.id, categoryId);
          dropdownContent.classList.remove('show');
        });
      });
      
      // 在GitHub中打開
      const openBtn = starItem.querySelector('.open-btn');
      openBtn.addEventListener('click', () => {
        openInGitHub(star.html_url);
      });
      
      starsList.appendChild(starItem);
    });
    
    // 應用當前分類過濾器
    filterItemsByCategory();
  } catch (error) {
    console.error('Error loading stars:', error);
    starsList.innerHTML = `<div class="error">${getMessage('failedToLoadStars')}</div>`;
  }
}

async function fetchGitHubData(endpoint, options = {}) {
  console.log(`Fetching data from ${endpoint} with token:`, accessToken ? accessToken.substring(0, 5) + '...' : 'none');
  
  if (!accessToken) {
    console.error('No access token available');
    throw new Error('No access token available');
  }
  
  let allData = [];
  let page = 1;
  let hasMore = true;

  try {
    // 如果這不是分頁請求（例如單個 Gist 請求），則進行單次獲取
    if (options.method === 'POST' || options.method === 'PATCH' || endpoint.includes('gists/')) {
      const url = `https://api.github.com/${endpoint}`;
      console.log(`Fetching from ${url}`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          ...options.headers
        }
      });
      
      // 檢查響應狀態
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error (${response.status}):`, errorText);
        
        // 創建包含詳細錯誤信息的錯誤對象
        const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.statusText = response.statusText;
        error.responseText = errorText;
        throw error;
      }

      return await response.json();
    }
    
    // 否則進行分頁請求（獲取列表數據）
    while (hasMore) {
      const url = `https://api.github.com/${endpoint}?page=${page}&per_page=100`;
      console.log(`Fetching page ${page} from ${url}`);
      
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API error (${response.status}):`, errorText);
        
        // 創建包含詳細錯誤信息的錯誤對象
        const error = new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        error.status = response.status;
        error.statusText = response.statusText;
        error.responseText = errorText;
        throw error;
      }

      const data = await response.json();
      console.log(`Received data from ${endpoint}, page ${page}:`, data ? (Array.isArray(data) ? `${data.length} items` : 'object') : 'null');
      
      if (Array.isArray(data)) {
        allData = allData.concat(data);
      } else {
        // 如果是單個對象（如用戶信息），直接返回
        return data;
      }

      // 檢查是否還有更多數據
      const linkHeader = response.headers.get('Link');
      hasMore = linkHeader && linkHeader.includes('rel="next"');
      page++;
    }
    
    return allData;
  } catch (error) {
    console.error(`Error fetching data from ${endpoint}:`, error);
    throw error;
  }
}

function switchTab(tab) {
  // 更新當前頁籤
  currentTab = tab;
  
  tabButtons.forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });
  
  tabContents.forEach(content => {
    content.classList.toggle('active', content.id === `${tab}-content`);
  });
}

// 初始化分類界面
function initCategoriesUI() {
  // 初始化分類下拉選單
  updateCategoryFilterSelect();
  
  // 添加事件監聽器
  if (addCategoryButton) {
    addCategoryButton.addEventListener('click', addNewCategory);
  }
  
  if (newCategoryInput) {
    newCategoryInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addNewCategory();
      }
    });
  }
  
  // Modal dialog buttons
  saveCategoriesButton.addEventListener('click', saveAndCloseCategoryDialog);
  cancelCategoriesButton.addEventListener('click', closeCategoryDialog);
  
  // 分類篩選器變更事件
  categoryFilterSelect.addEventListener('change', filterItemsByCategory);
  
  // Update the categories list in dropdown
  updateCategoryList();
}

// 更新分類過濾器下拉選單
function updateCategoryFilterSelect() {
  // 清空現有選項（保留"全部項目"選項）
  while (categoryFilterSelect.options.length > 1) {
    categoryFilterSelect.remove(1);
  }
  
  // 添加分類選項
  categories.forEach(category => {
    const option = document.createElement('option');
    option.value = category.name;
    option.textContent = category.name;
    categoryFilterSelect.appendChild(option);
  });
}

// 載入分類數據
async function loadCategoriesData() {
  try {
    // 首先嘗試從 GitHub Gist 載入
    const loadedFromGist = await loadCategoriesFromGist();
    
    if (!loadedFromGist) {
      console.log('Failed to load from Gist, loading from local storage');
      
      // 如果 Gist 載入失敗，嘗試從 chrome.storage 載入分類數據
      const data = await chrome.storage.sync.get(['categories', 'itemCategories']);
      
      if (data.categories && Array.isArray(data.categories)) {
        categories = data.categories;
        console.log('Categories loaded from local storage:', categories);
      } else {
        // 初始化默認分類
        categories = [
          { name: '收藏' },
          { name: '工作' },
          { name: '個人' }
        ];
        console.log('Using default categories');
      }
      
      // 載入項目分類關係數據
      if (data.itemCategories && typeof data.itemCategories === 'object') {
        itemCategories = data.itemCategories;
        console.log('Item categories loaded from local storage:', itemCategories);
      } else {
        itemCategories = {};
        console.log('Initializing empty item categories');
      }
      
      // 如果是初次載入，則同步到 Gist
      if (!data.categories || !data.itemCategories) {
        console.log('First time load, saving initial data to Gist');
        await saveCategoriesToGist();
      }
    }
  } catch (error) {
    console.error('Error loading categories:', error);
    // 使用默認分類
    categories = [
      { name: '收藏' },
      { name: '工作' },
      { name: '個人' }
    ];
    itemCategories = {};
  }
}

// 保存分類數據
async function saveCategoriesData() {
  try {
    // 存儲到 chrome.storage 本地
    await chrome.storage.sync.set({
      categories: categories,
      itemCategories: itemCategories
    });
    console.log('Categories saved to local storage');
    
    // 保存到 GitHub Gist
    await saveCategoriesToGist();
    
    console.log('Categories saved successfully');
  } catch (error) {
    console.error('Error saving categories:', error);
    showMessage('保存分類失敗', 'error');
  }
}

// 保存分類數據到 GitHub Gist
async function saveCategoriesToGist() {
  try {
    // 更新同步狀態指示器
    const syncIndicator = document.getElementById('sync-indicator');
    if (syncIndicator) {
      syncIndicator.textContent = getMessage('syncing');
      syncIndicator.className = 'sync-status syncing';
    }
    
    // 更新同步按鈕狀態
    updateSyncButtonState('syncing');
    
    // 將 itemCategories 數據轉換為新的格式
    // 先複製 categories 並清除 repositories
    const categoriesToSave = categories.map(cat => ({
      ...cat,
      repositories: []
    }));
    
    // 將 itemCategories 數據整合進去
    Object.keys(itemCategories).forEach(itemId => {
      const categoryNames = itemCategories[itemId];
      categoryNames.forEach(catName => {
        const catIndex = categoriesToSave.findIndex(c => c.name === catName);
        if (catIndex !== -1) {
          if (!categoriesToSave[catIndex].repositories) {
            categoriesToSave[catIndex].repositories = [];
          }
          categoriesToSave[catIndex].repositories.push({
            id: itemId
          });
        }
      });
    });
    
    // 獲取當前語言設定
    const currentLang = getCurrentLanguage();
    
    // 準備 Gist 內容
    const categoriesData = {
      categories: categoriesToSave,
      lastUpdated: new Date().toISOString(),
      language: currentLang // 加入當前語言設定
    };
    
    const gistContent = JSON.stringify(categoriesData, null, 2);
    
    // 檢查是否已經有現有的 Gist
    if (categoriesGistId) {
      try {
        // 更新已有的 Gist
        console.log('Updating existing Gist:', categoriesGistId);
        await fetchGitHubData(`gists/${categoriesGistId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            description: CATEGORIES_GIST_DESCRIPTION,
            files: {
              [CATEGORIES_GIST_FILENAME]: {
                content: gistContent
              }
            }
          })
        });
      } catch (updateError) {
        console.error('Error updating Gist:', updateError);
        
        // 如果是 404 錯誤（Gist 不存在），則創建新的 Gist
        if (updateError.status === 404) {
          console.log('Gist not found (404), creating a new one');
          // 清除無效的 Gist ID
          categoriesGistId = null;
          await chrome.storage.sync.remove('categoriesGistId');
          
          // 創建新的 Gist
          console.log('Creating new Gist for categories');
          const response = await fetchGitHubData('gists', {
            method: 'POST',
            body: JSON.stringify({
              description: CATEGORIES_GIST_DESCRIPTION,
              public: false,
              files: {
                [CATEGORIES_GIST_FILENAME]: {
                  content: gistContent
                }
              }
            })
          });
          
          // 保存新創建的 Gist ID
          categoriesGistId = response.id;
          console.log('New Gist created with ID:', categoriesGistId);
          
          // 保存 Gist ID 到 storage
          await chrome.storage.sync.set({ categoriesGistId: categoriesGistId });
        } else {
          // 其他錯誤則拋出
          throw updateError;
        }
      }
    } else {
      // 創建新的 Gist
      console.log('Creating new Gist for categories');
      const response = await fetchGitHubData('gists', {
        method: 'POST',
        body: JSON.stringify({
          description: CATEGORIES_GIST_DESCRIPTION,
          public: false,
          files: {
            [CATEGORIES_GIST_FILENAME]: {
              content: gistContent
            }
          }
        })
      });
      
      // 保存新創建的 Gist ID
      categoriesGistId = response.id;
      console.log('New Gist created with ID:', categoriesGistId);
      
      // 保存 Gist ID 到 storage
      await chrome.storage.sync.set({ categoriesGistId: categoriesGistId });
    }
    
    // 更新同步狀態
    if (syncIndicator) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      syncIndicator.textContent = `${getMessage('syncedAt')} (${timeStr})`;
      syncIndicator.className = 'sync-status synced';
    }
    
    // 恢復同步按鈕狀態
    updateSyncButtonState('default');
    
    showMessage('syncedToGithub', 'success');
    return true;
  } catch (error) {
    console.error('Error saving categories to Gist:', error);
    
    // 更新同步狀態
    const syncIndicator = document.getElementById('sync-indicator');
    if (syncIndicator) {
      syncIndicator.textContent = getMessage('syncFailed');
      syncIndicator.className = 'sync-status sync-error';
    }
    
    // 更新同步按鈕為錯誤狀態
    updateSyncButtonState('error');
    
    showMessage('syncToGithubFailed', 'error');
    return false;
  }
}

// 從 Gist 載入分類數據
async function loadCategoriesFromGist() {
  try {
    // 更新同步狀態指示器
    const syncIndicator = document.getElementById('sync-indicator');
    if (syncIndicator) {
      syncIndicator.textContent = getMessage('loading');
      syncIndicator.className = 'sync-status syncing';
    }
    
    // 更新同步按鈕狀態
    updateSyncButtonState('syncing');
    
    // 從 storage 獲取已保存的 Gist ID
    const data = await chrome.storage.sync.get(['categoriesGistId']);
    
    if (data.categoriesGistId) {
      categoriesGistId = data.categoriesGistId;
      console.log('Found stored Gist ID:', categoriesGistId);
      
      try {
        // 嘗試從 Gist 獲取數據
        const gistData = await fetchGitHubData(`gists/${categoriesGistId}`);
        
        if (gistData && gistData.files && gistData.files[CATEGORIES_GIST_FILENAME]) {
          const content = gistData.files[CATEGORIES_GIST_FILENAME].content;
          let parsedData;
          
          try {
            parsedData = JSON.parse(content);
            console.log('Parsed Gist data:', parsedData);
          } catch (parseError) {
            console.error('Error parsing Gist JSON content:', parseError);
            showMessage('gistFormatError', 'error');
            updateSyncButtonState('error');
            return false;
          }
          
          // 支持不同版本的數據格式
          let categoriesData = [];
          
          // 處理不同格式的資料
          if (parsedData.categories && Array.isArray(parsedData.categories)) {
            categoriesData = parsedData.categories;
          } else if (Array.isArray(parsedData)) {
            categoriesData = parsedData;
          } else {
            // 嘗試處理其他格式
            console.warn('Unknown data format in found Gist, attempting to migrate');
            
            if (typeof parsedData === 'object') {
              // 查找任何看起來像分類的數組
              for (const key in parsedData) {
                if (Array.isArray(parsedData[key])) {
                  const possibleCategories = parsedData[key];
                  if (possibleCategories.length > 0 && 
                      possibleCategories[0].name && 
                      (possibleCategories[0].repositories === undefined || 
                       Array.isArray(possibleCategories[0].repositories))) {
                    categoriesData = possibleCategories;
                    break;
                  }
                }
              }
            }
          }
          
          // 如果找到了有效的分類數據
          if (categoriesData.length > 0) {
            // 保存原始分類數據
            categories = categoriesData.map(cat => ({
              name: cat.name,
              repositories: Array.isArray(cat.repositories) ? cat.repositories : []
            }));
            
            // 將新格式轉換為兼容舊格式的數據
            // 清空舊的項目分類關係
            itemCategories = {};
            
            // 將新格式的數據轉換為舊格式
            categories.forEach(category => {
              if (category.repositories && Array.isArray(category.repositories)) {
                category.repositories.forEach(repo => {
                  const itemId = repo.id || (repo.repoId || repo.starId);
                  if (itemId) {
                    if (!itemCategories[itemId]) {
                      itemCategories[itemId] = [];
                    }
                    if (!itemCategories[itemId].includes(category.name)) {
                      itemCategories[itemId].push(category.name);
                    }
                  }
                });
              }
            });
            
            console.log('Categories loaded from found Gist:', categories);
            console.log('Item categories converted:', itemCategories);
            
            // 處理語言設定
            if (parsedData.language) {
              savedLanguage = parsedData.language;
              console.log('Language preference loaded from Gist:', savedLanguage);
            }
            
            // 更新同步狀態
            if (syncIndicator) {
              if (parsedData.lastUpdated) {
                const updateDate = new Date(parsedData.lastUpdated);
                const timeStr = `${updateDate.getHours().toString().padStart(2, '0')}:${updateDate.getMinutes().toString().padStart(2, '0')}`;
                const dateStr = `${updateDate.getFullYear()}-${(updateDate.getMonth() + 1).toString().padStart(2, '0')}-${updateDate.getDate().toString().padStart(2, '0')}`;
                syncIndicator.textContent = `${getMessage('syncedAt')} (${dateStr} ${timeStr})`;
              } else {
                syncIndicator.textContent = getMessage('synced');
              }
              syncIndicator.className = 'sync-status synced';
            }
            
            // 更新同步按鈕狀態
            updateSyncButtonState('default');
            
            // 載入成功後立即以新格式保存，確保格式一致性
            if (Array.isArray(parsedData) || !parsedData.categories) {
              console.log('Converting to new format and saving back to Gist');
              await saveCategoriesToGist();
            }
            
            showMessage('syncedToGithub', 'info');
            return true;
          } else {
            console.warn('No valid categories found in the Gist data');
            categoriesGistId = null;
            await chrome.storage.sync.remove('categoriesGistId');
            updateSyncButtonState('error');
          }
        }
      } catch (gistError) {
        console.error('Error fetching Gist:', gistError);
        
        // 檢查是否是 404 錯誤 (Gist 不存在)
        if (gistError.status === 404) {
          console.log('Gist not found (404), will create a new one');
          // 清除無效的 Gist ID
          categoriesGistId = null;
          await chrome.storage.sync.remove('categoriesGistId');
          
          // 嘗試創建新的 Gist
          const created = await createNewCategoriesGist();
          if (created) {
            updateSyncButtonState('default');
            return true;
          }
        }
        // 顯示錯誤狀態
        updateSyncButtonState('error');
      }
    }
    
    // 如果沒有找到 Gist 或加載失敗，嘗試尋找名為 "better-github-ux" 的 Gist
    let found = await findCategoriesGist();
    
    // 如果仍然找不到，創建一個新的
    if (!found) {
      console.log('No existing Gist found, creating a new one');
      found = await createNewCategoriesGist();
    }
    
    // 更新同步狀態
    if (syncIndicator) {
      if (found) {
        syncIndicator.textContent = getMessage('synced');
        syncIndicator.className = 'sync-status synced';
        updateSyncButtonState('default');
      } else {
        syncIndicator.textContent = getMessage('notSynced');
        syncIndicator.className = 'sync-status not-synced';
        updateSyncButtonState('error');
      }
    }
    
    return found;
  } catch (error) {
    console.error('Error loading categories from Gist:', error);
    
    // 更新同步狀態
    const syncIndicator = document.getElementById('sync-indicator');
    if (syncIndicator) {
      syncIndicator.textContent = getMessage('syncFailed');
      syncIndicator.className = 'sync-status sync-error';
    }
    
    // 更新同步按鈕為錯誤狀態
    updateSyncButtonState('error');
    
    return false;
  }
}

// 創建新的分類 Gist
async function createNewCategoriesGist() {
  try {
    console.log('Creating new categories Gist');
    
    // 更新同步按鈕狀態
    updateSyncButtonState('syncing');
    
    // 準備 Gist 內容
    const categoriesToSave = categories.map(cat => ({
      ...cat,
      repositories: cat.repositories || []
    }));
    
    // 獲取當前語言設定
    const currentLang = getCurrentLanguage();
    
    const categoriesData = {
      categories: categoriesToSave,
      lastUpdated: new Date().toISOString(),
      language: currentLang // 加入當前語言設定
    };
    
    const gistContent = JSON.stringify(categoriesData, null, 2);
    
    // 創建新的 Gist
    const response = await fetchGitHubData('gists', {
      method: 'POST',
      body: JSON.stringify({
        description: CATEGORIES_GIST_DESCRIPTION,
        public: false,
        files: {
          [CATEGORIES_GIST_FILENAME]: {
            content: gistContent
          }
        }
      })
    });
    
    // 保存新創建的 Gist ID
    categoriesGistId = response.id;
    console.log('New Gist created with ID:', categoriesGistId);
    
    // 保存 Gist ID 到 storage
    await chrome.storage.sync.set({ categoriesGistId: categoriesGistId });
    
    // 更新同步按鈕狀態
    updateSyncButtonState('default');
    
    showMessage('createdAndSyncedToGithub', 'success');
    
    return true;
  } catch (error) {
    console.error('Error creating new Gist:', error);
    
    // 更新同步按鈕為錯誤狀態
    updateSyncButtonState('error');
    
    showMessage('createGistFailed', 'error');
    return false;
  }
}

// 尋找名為 "better-github-ux" 的 Gist
async function findCategoriesGist() {
  try {
    console.log('Searching for existing categories Gist');
    
    const gists = await fetchGitHubData('gists');
    if (!gists || gists.length === 0) {
      console.log('User has no Gists, will create a new one');
      return false;
    }
    
    for (const gist of gists) {
      // 檢查是否是我們的分類 Gist
      if (gist.description === CATEGORIES_GIST_DESCRIPTION || 
          (gist.files && gist.files[CATEGORIES_GIST_FILENAME])) {
        
        categoriesGistId = gist.id;
        console.log('Found categories Gist:', categoriesGistId);
        
        // 保存找到的 ID
        await chrome.storage.sync.set({ categoriesGistId: categoriesGistId });
        
        try {
          // 載入內容
          let content = '';
          if (gist.files && gist.files[CATEGORIES_GIST_FILENAME]) {
            // 如果 Gist 對象已包含內容
            if (gist.files[CATEGORIES_GIST_FILENAME].content) {
              content = gist.files[CATEGORIES_GIST_FILENAME].content;
            } 
            // 否則需要單獨請求 Gist 獲取內容
            else {
              const gistData = await fetchGitHubData(`gists/${categoriesGistId}`);
              if (gistData.files && gistData.files[CATEGORIES_GIST_FILENAME]) {
                content = gistData.files[CATEGORIES_GIST_FILENAME].content;
              }
            }
          }
          
          if (content) {
            try {
              const parsedData = JSON.parse(content);
              let categoriesData = [];
              
              // 處理不同格式的資料
              if (parsedData.categories && Array.isArray(parsedData.categories)) {
                categoriesData = parsedData.categories;
              } else if (Array.isArray(parsedData)) {
                categoriesData = parsedData;
              } else {
                // 嘗試處理其他格式
                console.warn('Unknown data format in found Gist, attempting to migrate');
                
                if (typeof parsedData === 'object') {
                  // 查找任何看起來像分類的數組
                  for (const key in parsedData) {
                    if (Array.isArray(parsedData[key])) {
                      const possibleCategories = parsedData[key];
                      if (possibleCategories.length > 0 && 
                          possibleCategories[0].name && 
                          (possibleCategories[0].repositories === undefined || 
                           Array.isArray(possibleCategories[0].repositories))) {
                        categoriesData = possibleCategories;
                        break;
                      }
                    }
                  }
                }
              }
              
              // 如果找到了有效的分類數據
              if (categoriesData.length > 0) {
                // 保存原始分類數據
                categories = categoriesData.map(cat => ({
                  name: cat.name,
                  repositories: Array.isArray(cat.repositories) ? cat.repositories : []
                }));
                
                // 將新格式轉換為兼容舊格式的數據
                // 清空舊的項目分類關係
                itemCategories = {};
                
                // 將新格式的數據轉換為舊格式
                categories.forEach(category => {
                  if (category.repositories && Array.isArray(category.repositories)) {
                    category.repositories.forEach(repo => {
                      const itemId = repo.id || (repo.repoId || repo.starId);
                      if (itemId) {
                        if (!itemCategories[itemId]) {
                          itemCategories[itemId] = [];
                        }
                        if (!itemCategories[itemId].includes(category.name)) {
                          itemCategories[itemId].push(category.name);
                        }
                      }
                    });
                  }
                });
                
                console.log('Categories loaded from found Gist:', categories);
                console.log('Item categories converted:', itemCategories);
                
                // 處理語言設定
                if (parsedData.language) {
                  savedLanguage = parsedData.language;
                  console.log('Language preference loaded from Gist:', savedLanguage);
                }
                
                // 載入成功後立即以新格式保存，確保格式一致性
                if (Array.isArray(parsedData) || !parsedData.categories) {
                  console.log('Converting to new format and saving back to Gist');
                  await saveCategoriesToGist();
                }
                
                showMessage('syncedToGithub', 'info');
                return true;
              } else {
                console.warn('No valid categories found in the Gist data');
                categoriesGistId = null;
                await chrome.storage.sync.remove('categoriesGistId');
              }
            } catch (parseError) {
              console.error('Error parsing Gist content:', parseError);
              showMessage('gistFormatError', 'error');
              
              // 如果解析失敗，可能是格式不正確，設置 ID 為 null 以便創建新的
              categoriesGistId = null;
              await chrome.storage.sync.remove('categoriesGistId');
            }
          } else {
            console.error('No content found in Gist');
          }
        } catch (contentError) {
          console.error('Error loading Gist content:', contentError);
          
          // 如果是 404 錯誤，表示 Gist 已被刪除
          if (contentError.status === 404) {
            categoriesGistId = null;
            await chrome.storage.sync.remove('categoriesGistId');
          }
        }
        
        break;
      }
    }
    
    // 如果找不到有效的 Gist，返回 false
    if (!categoriesGistId) {
      console.log('No valid categories Gist found');
      return false;
    }
    
    return !!categoriesGistId;
  } catch (error) {
    console.error('Error finding categories Gist:', error);
    return false;
  }
}

// 更新分類列表顯示
function updateCategoryList() {
  // Make sure we have categoriesList from the dropdown
  if (!categoriesList) {
    console.error('Categories list element not found');
    return;
  }

  // Clear the existing list
  categoriesList.innerHTML = '';
  
  // Check if there are any categories
  if (categories.length === 0) {
    const emptyMessage = document.createElement('div');
    emptyMessage.className = 'empty-categories';
    emptyMessage.textContent = getMessage('noCategoriesYet');
    categoriesList.appendChild(emptyMessage);
    return;
  }
  
  // Add each category to the list
  categories.forEach(category => {
    const listItem = document.createElement('div');
    listItem.className = 'category-item';
    
    // Category name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = category.name;
    nameSpan.className = 'category-name';
    
    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = getMessage('delete');
    deleteButton.className = 'category-delete';
    deleteButton.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteCategory(category.name);
    });
    
    // Add elements to the list item
    listItem.appendChild(nameSpan);
    listItem.appendChild(deleteButton);
    
    // Add the list item to the categories list
    categoriesList.appendChild(listItem);
  });
}

// 添加新分類
function addNewCategory() {
  const categoryName = newCategoryInput.value.trim();
  
  if (!categoryName) {
    showMessage('pleaseEnterCategoryName', 'error');
    return;
  }
  
  // 檢查是否已存在相同名稱的分類
  if (categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
    showMessage('categoryExists', 'error');
    return;
  }
  
  const newCategory = {
    name: categoryName,
    repositories: [] // 初始化空的儲存庫列表
  };
  
  categories.push(newCategory);
  newCategoryInput.value = '';
  showMessage('categoryAdded', 'success', categoryName);
  
  // 更新分類列表顯示
  updateCategoryList();
  
  // 立即儲存分類到本地和 Gist
  saveCategoriesData();
}

// 刪除分類
async function deleteCategory(categoryName) {
  // Confirm deletion with user
  if (!confirm(getMessage('deleteConfirmation', categoryName))) {
    return;
  }
  
  // 找到要刪除的分類索引
  const index = categories.findIndex(cat => cat.name === categoryName);
  if (index === -1) return;
  
  // 刪除分類
  categories.splice(index, 1);
  
  // 移除與該分類相關的項目分類關係
  Object.keys(itemCategories).forEach(itemId => {
    if (itemCategories[itemId].includes(categoryName)) {
      itemCategories[itemId] = itemCategories[itemId].filter(name => name !== categoryName);
      
      // 如果項目沒有分類，刪除該項目的記錄
      if (itemCategories[itemId].length === 0) {
        delete itemCategories[itemId];
      }
    }
  });
  
  // 更新界面
  updateCategoryList();
  updateCategoryFilterSelect();
  
  // 更新受影響項目的分類標記
  const itemsToUpdate = [];
  categories.forEach(category => {
    if (category.repositories && Array.isArray(category.repositories)) {
      category.repositories.forEach(repo => {
        if (repo.name === categoryName) {
          itemsToUpdate.push(repo.id);
        }
      });
    }
  });
  
  // 應用當前過濾器
  filterItemsByCategory();
  
  // 立即儲存更新後的分類數據
  await saveCategoriesData();
  
  showMessage('categoryDeleted', 'info', categoryName);
}

// 顯示分類管理對話框
function showCategoryDialog() {
  // 更新分類列表顯示
  updateCategoryList();
  
  // 清空輸入框
  if (newCategoryInput) {
    newCategoryInput.value = '';
  }
  
  // 顯示對話框
  categoryDialog.classList.add('show');
  
  // 聚焦到輸入框方便用戶立即輸入
  if (newCategoryInput) {
    setTimeout(() => {
      newCategoryInput.focus();
    }, 100);
  }
}

// 關閉分類管理對話框
function closeCategoryDialog() {
  categoryDialog.classList.remove('show');
}

// 保存並關閉分類對話框
async function saveAndCloseCategoryDialog() {
  try {
    // 先關閉對話框，給用戶立即反饋
    closeCategoryDialog();
    
    // 顯示保存中訊息
    showMessage('savingCategories', 'info');
    showLoading();
    
    // 保存數據
    await saveCategoriesData();
    
    // 更新分類下拉選單
    updateCategoryFilterSelect();
    
    // 重新加載項目顯示
    if (currentTab === 'repos') {
      displayRepositories(repositories);
    } else if (currentTab === 'stars') {
      loadStars();
    }
    
    showMessage('categoriesSaved', 'success');
    hideLoading();
  } catch (error) {
    console.error('Error saving categories:', error);
    showMessage('savingCategoriesFailed', 'error');
    hideLoading();
  }
}

// 根據分類過濾項目
function filterItemsByCategory() {
  const selectedCategoryName = categoryFilterSelect.value;
  
  // 獲取所有列表項目
  const items = document.querySelectorAll('.repo-item, .star-item');
  
  if (selectedCategoryName === 'all') {
    // 顯示所有項目
    items.forEach(item => {
      item.style.display = '';
    });
  } else {
    // 僅顯示屬於所選分類的項目
    items.forEach(item => {
      const itemId = item.dataset.id;
      if (itemCategories[itemId] && itemCategories[itemId].includes(selectedCategoryName)) {
        item.style.display = '';
      } else {
        item.style.display = 'none';
      }
    });
  }
}

// 顯示項目分類管理對話框
function showItemCategoryDialog(itemId, itemName, itemType) {
  // 設置當前項目信息
  currentItemId = itemId;
  currentItemName = itemName;
  currentItemType = itemType;
  
  // 更新對話框標題
  itemCategoryTitle.textContent = getMessage('setCategoriesFor', itemName);
  
  // 清空分類選擇列表
  itemCategoriesList.innerHTML = '';
  
  // 清空快速添加輸入框
  if (newQuickCategoryInput) {
    newQuickCategoryInput.value = '';
  }
  
  // 添加所有分類選項
  categories.forEach(category => {
    const checkboxWrapper = document.createElement('div');
    checkboxWrapper.className = 'category-checkbox-wrapper';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `category-${category.name}`;
    checkbox.value = category.name;
    
    // 如果項目已有此分類，則選中
    if (itemCategories[itemId] && itemCategories[itemId].includes(category.name)) {
      checkbox.checked = true;
    }
    
    const label = document.createElement('label');
    label.htmlFor = `category-${category.name}`;
    label.textContent = category.name;
    
    checkboxWrapper.appendChild(checkbox);
    checkboxWrapper.appendChild(label);
    
    itemCategoriesList.appendChild(checkboxWrapper);
  });
  
  // 顯示對話框
  itemCategoryDialog.classList.add('show');
  
  // 聚焦到輸入框方便用戶立即輸入
  if (newQuickCategoryInput) {
    setTimeout(() => {
      newQuickCategoryInput.focus();
    }, 100);
  }
}

// 切換項目分類
async function toggleItemCategory(itemId, categoryName) {
  try {
    showLoading();
    
    // 如果項目還沒有分類，初始化空陣列
    if (!itemCategories[itemId]) {
      itemCategories[itemId] = [];
    }
    
    // 檢查項目是否已有此分類
    const categoryIndex = itemCategories[itemId].indexOf(categoryName);
    
    if (categoryIndex === -1) {
      // 如果沒有，添加分類
      itemCategories[itemId].push(categoryName);
      // 同時更新 categories 結構中的 repositories
      updateCategoryRepositories(categoryName, itemId, 'add');
      showMessage('addedToCategory', 'success');
    } else {
      // 如果有，移除分類
      itemCategories[itemId].splice(categoryIndex, 1);
      // 同時更新 categories 結構中的 repositories
      updateCategoryRepositories(categoryName, itemId, 'remove');
      
      // 如果項目沒有分類了，刪除該項目的分類記錄
      if (itemCategories[itemId].length === 0) {
        delete itemCategories[itemId];
      }
      showMessage('removedFromCategory', 'info');
    }
    
    // 保存分類數據
    await saveCategoriesData();
    
    // 更新界面
    const repoElement = document.querySelector(`.repo-item[data-id="${itemId}"]`);
    const starElement = document.querySelector(`.star-item[data-id="${itemId}"]`);
    
    if (repoElement) {
      updateRepositoryCategoryBadges(itemId);
      // 更新下拉選單項目
      updateCategoryDropdownItems(repoElement, itemId);
    } else if (starElement) {
      updateStarCategoryBadges(itemId);
      // 更新下拉選單項目
      updateCategoryDropdownItems(starElement, itemId);
    }
    
    // 應用當前過濾器
    filterItemsByCategory();
    
    hideLoading();
  } catch (error) {
    console.error('Error toggling category:', error);
    showMessage('categoryOperationFailed', 'error');
    hideLoading();
  }
}

// 更新分類中的儲存庫列表
function updateCategoryRepositories(categoryName, itemId, action) {
  const categoryIndex = categories.findIndex(cat => cat.name === categoryName);
  if (categoryIndex === -1) return;
  
  // 確保存在 repositories 陣列
  if (!categories[categoryIndex].repositories) {
    categories[categoryIndex].repositories = [];
  }
  
  if (action === 'add') {
    // 檢查是否已存在
    const existingIndex = categories[categoryIndex].repositories.findIndex(repo => repo.id === itemId);
    if (existingIndex === -1) {
      // 如果不存在，添加
      categories[categoryIndex].repositories.push({ id: itemId });
    }
  } else if (action === 'remove') {
    // 移除項目
    categories[categoryIndex].repositories = categories[categoryIndex].repositories.filter(repo => repo.id !== itemId);
  }
}

// 保存項目分類設置
async function saveItemCategories() {
  try {
    showLoading();
    
    const selectedCategories = [];
    const checkboxes = itemCategoriesList.querySelectorAll('input[type="checkbox"]:checked');
    
    // 儲存之前的分類
    const previousCategories = itemCategories[currentItemId] || [];
    
    checkboxes.forEach(checkbox => {
      selectedCategories.push(checkbox.value);
    });
    
    // 找出需要移除的分類
    const categoriesToRemove = previousCategories.filter(catName => !selectedCategories.includes(catName));
    
    // 找出需要添加的分類
    const categoriesToAdd = selectedCategories.filter(catName => !previousCategories.includes(catName));
    
    // 更新項目分類數據
    if (selectedCategories.length > 0) {
      itemCategories[currentItemId] = selectedCategories;
    } else {
      // 如果沒有選擇任何分類，則刪除該項目的分類記錄
      delete itemCategories[currentItemId];
    }
    
    // 更新分類的儲存庫列表
    categoriesToRemove.forEach(catName => {
      updateCategoryRepositories(catName, currentItemId, 'remove');
    });
    
    categoriesToAdd.forEach(catName => {
      updateCategoryRepositories(catName, currentItemId, 'add');
    });
    
    // 立即保存變更
    await saveCategoriesData();
    
    // 更新界面中的分類標記
    if (currentItemType === 'repo') {
      updateRepositoryCategoryBadges(currentItemId);
    } else if (currentItemType === 'star') {
      updateStarCategoryBadges(currentItemId);
    }
    
    // 關閉對話框
    closeItemCategoryDialog();
    
    // 顯示成功訊息
    showMessage('categoriesUpdated', 'success');
    
    // 應用當前過濾器
    filterItemsByCategory();
    
    hideLoading();
  } catch (error) {
    console.error('Error saving item categories:', error);
    showMessage('savingCategoriesFailed', 'error');
    hideLoading();
  }
}

// 關閉項目分類對話框
function closeItemCategoryDialog() {
  itemCategoryDialog.classList.remove('show');
}

// 更新倉庫的分類標記
function updateRepositoryCategoryBadges(repoId) {
  const repoElement = document.querySelector(`.repo-item[data-id="${repoId}"]`);
  if (!repoElement) return;
  
  const badgesContainer = repoElement.querySelector('.category-badges');
  if (!badgesContainer) return;
  
  updateCategoryBadges(badgesContainer, repoId);
}

// 更新星標的分類標記
function updateStarCategoryBadges(starId) {
  const starElement = document.querySelector(`.star-item[data-id="${starId}"]`);
  if (!starElement) return;
  
  const badgesContainer = starElement.querySelector('.category-badges');
  if (!badgesContainer) return;
  
  updateCategoryBadges(badgesContainer, starId);
}

// 通用更新分類標記功能
function updateCategoryBadges(badgesContainer, itemId) {
  // 清空現有標記
  badgesContainer.innerHTML = '';
  
  // 如果項目有分類，則添加分類標記
  if (itemCategories[itemId]) {
    itemCategories[itemId].forEach(categoryName => {
      const category = categories.find(c => c.name === categoryName);
      if (category) {
        const badge = document.createElement('span');
        badge.className = 'category-badge';
        badge.textContent = category.name;
        badgesContainer.appendChild(badge);
      }
    });
  }
}

// 顯示提示訊息
function showMessage(messageKey, type = 'info', ...args) {
  if (!messageContainer) return;
  
  // Get the translated message
  let message = messageKey;
  
  // If the message key exists in the i18n, use it
  // Otherwise, use the original message text
  try {
    message = getMessage(messageKey, ...args) || messageKey;
  } catch (e) {
    console.warn('Translation not found for message:', messageKey);
  }
  
  const messageElement = document.createElement('div');
  messageElement.className = `message ${type}`;
  messageElement.textContent = message;
  
  messageContainer.appendChild(messageElement);
  
  // 顯示訊息
  setTimeout(() => {
    messageElement.classList.add('show');
  }, 10);
  
  // 自動消失
  setTimeout(() => {
    messageElement.classList.remove('show');
    setTimeout(() => {
      messageContainer.removeChild(messageElement);
    }, 300);
  }, 3000);
}

// 生成分類下拉選單項目
function generateCategoryDropdownItems(itemId) {
  let itemsHtml = '';
  
  categories.forEach(category => {
    const isActive = itemCategories[itemId] && itemCategories[itemId].includes(category.name);
    itemsHtml += `
      <a class="dropdown-item quick-category-item ${isActive ? 'active' : ''}" 
         data-category-name="${category.name}">
        ${isActive ? '✓ ' : ''}${category.name}
      </a>
    `;
  });
  
  if (categories.length === 0) {
    itemsHtml = '<a class="dropdown-item disabled">無分類</a>';
  }
  
  return itemsHtml;
}

// 更新下拉選單項目
function updateCategoryDropdownItems(itemElement, itemId) {
  const dropdownContent = itemElement.querySelector('.dropdown-content');
  // 清除現有的分隔線和分類項目
  const divider = dropdownContent.querySelector('.dropdown-divider');
  while (divider.nextSibling) {
    dropdownContent.removeChild(divider.nextSibling);
  }
  
  // 添加新的分類項目
  const categoriesHtml = generateCategoryDropdownItems(itemId);
  divider.insertAdjacentHTML('afterend', categoriesHtml);
  
  // 重新添加事件監聽器
  const categoryItems = dropdownContent.querySelectorAll('.quick-category-item');
  categoryItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const categoryName = e.target.dataset.categoryName;
      toggleItemCategory(itemId, categoryName);
      dropdownContent.classList.remove('show');
    });
  });
}

// 關閉所有打開的下拉選單
function closeAllDropdowns(event) {
  const dropdowns = document.querySelectorAll('.dropdown-content.show');
  dropdowns.forEach(dropdown => {
    // 如果點擊的不是下拉選單或其子元素
    if (!dropdown.parentElement.contains(event.target)) {
      dropdown.classList.remove('show');
    }
  });
}

// 在項目分類對話框中快速添加新分類
async function addQuickCategory() {
  const categoryName = newQuickCategoryInput.value.trim();
  
  if (!categoryName) {
    showMessage('pleaseEnterCategoryName', 'error');
    return;
  }
  
  // 檢查是否已存在相同名稱的分類
  if (categories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
    showMessage('categoryExists', 'error');
    return;
  }
  
  const newCategory = {
    name: categoryName,
    repositories: []
  };
  
  // 添加到分類列表
  categories.push(newCategory);
  
  // 清空輸入框
  newQuickCategoryInput.value = '';
  
  // 立即保存分類
  await saveCategoriesData();
  
  // 更新分類勾選列表
  refreshItemCategoriesList();
  
  // 自動勾選新建的分類
  const checkbox = document.querySelector(`#category-${categoryName}`);
  if (checkbox) {
    checkbox.checked = true;
  }
  
  showMessage('categoryAdded', 'success', categoryName);
}

// 刷新項目分類列表
function refreshItemCategoriesList() {
  // 保存當前已勾選的分類
  const checkedCategories = [];
  const checkboxes = itemCategoriesList.querySelectorAll('input[type="checkbox"]:checked');
  checkboxes.forEach(checkbox => {
    checkedCategories.push(checkbox.value);
  });
  
  // 清空現有列表
  itemCategoriesList.innerHTML = '';
  
  // 重新生成分類列表
  categories.forEach(category => {
    const checkboxWrapper = document.createElement('div');
    checkboxWrapper.className = 'category-checkbox-wrapper';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = `category-${category.name}`;
    checkbox.value = category.name;
    
    // 如果之前已勾選，則保持勾選
    if (checkedCategories.includes(category.name) || 
        (itemCategories[currentItemId] && itemCategories[currentItemId].includes(category.name))) {
      checkbox.checked = true;
    }
    
    const label = document.createElement('label');
    label.htmlFor = `category-${category.name}`;
    label.textContent = category.name;
    
    checkboxWrapper.appendChild(checkbox);
    checkboxWrapper.appendChild(label);
    
    itemCategoriesList.appendChild(checkboxWrapper);
  });
}

// 顯示/隱藏載入中遮罩
function showLoading() {
  if (loadingOverlay) {
    loadingOverlay.classList.remove('hidden');
  }
}

function hideLoading() {
  if (loadingOverlay) {
    loadingOverlay.classList.add('hidden');
  }
}

// 在GitHub中打開
function openInGitHub(url) {
  window.open(url, '_blank');
}

// 更新同步按鈕的圖標和文字
function updateSyncButtonState(state) {
  if (!syncCategoriesButton) return;
  
  switch (state) {
    case 'syncing':
      syncCategoriesButton.innerHTML = `<i class="fas fa-sync fa-spin"></i>`;
      syncCategoriesButton.disabled = true;
      break;
    case 'error':
      syncCategoriesButton.innerHTML = `<i class="fas fa-exclamation-circle"></i>`;
      syncCategoriesButton.disabled = true;
      break;
    case 'default':
    default:
      syncCategoriesButton.innerHTML = `<i class="fas fa-cloud-upload-alt"></i>`;
      syncCategoriesButton.disabled = false;
      break;
  }
}

// Function to initialize after login succeeded
async function initializeAfterLogin(token) {
  // Save token locally
  accessToken = token;
  await chrome.storage.local.set({ accessToken: token });
  
  // Also share token with background script for direct Gist access
  try {
    await chrome.runtime.sendMessage({ 
      action: 'storeAccessToken', 
      token: token 
    });
    console.log('Token shared with background script');
  } catch (error) {
    console.warn('Could not share token with background script:', error);
  }
  
  console.log('Got access token');
  
  // 顯示登錄後的界面
  document.getElementById('login-section').classList.add('hidden');
  document.getElementById('user-section').classList.remove('hidden');
  
  // 加載用戶資料
  await loadUserData();
  
  // Dispatch a logged-in event
  window.dispatchEvent(new Event('logged-in'));
}

// GitHub 登入
async function loginWithGitHub() {
  showLoading();
  
  try {
    const url = `https://github.com/login/oauth/authorize?client_id=${config.clientId}&scope=repo,user,gist`;
    const callbackURL = chrome.identity.getRedirectURL();
    
    chrome.identity.launchWebAuthFlow({
      url: url,
      interactive: true
    }, async (responseUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Authentication error:', chrome.runtime.lastError.message);
        showMessage('Authentication failed', 'error');
        hideLoading();
        return;
      }
      
      if (!responseUrl) {
        console.error('No response URL returned');
        showMessage('Authentication failed', 'error');
        hideLoading();
        return;
      }
      
      // 從回傳的 URL 獲取 code 參數
      const code = new URL(responseUrl).searchParams.get('code');
      
      if (!code) {
        console.error('No authorization code in response');
        showMessage('Authentication failed', 'error');
        hideLoading();
        return;
      }
      
      console.log('Got authorization code');
      
      // 交換 code 獲取訪問令牌
      try {
        const exchangeEndpoint = 'https://corsproxy.io/?https://github.com/login/oauth/access_token';
        
        const exchangeResponse = await fetch(exchangeEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code: code
          })
        });
        
        const tokenData = await exchangeResponse.json();
        
        if (!tokenData.access_token) {
          console.error('Failed to exchange code for token:', tokenData);
          showMessage('Failed to complete authentication', 'error');
          hideLoading();
          return;
        }
        
        // Use the initialization function
        await initializeAfterLogin(tokenData.access_token);
        hideLoading();
        
      } catch (exchangeError) {
        console.error('Error exchanging code for token:', exchangeError);
        showMessage('Failed to complete authentication', 'error');
        hideLoading();
      }
    });
  } catch (error) {
    console.error('GitHub login error:', error);
    showMessage('Authentication failed', 'error');
    hideLoading();
  }
} 