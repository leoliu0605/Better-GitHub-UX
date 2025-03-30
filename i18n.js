// Supported languages and their display names
const supportedLanguages = {
  'en': 'English',
  'zh-TW': '繁體中文'
};

// Default language
const defaultLanguage = 'en';

// Cache for loaded language messages
const messageCache = {};

// Current language
let currentLanguage = null;

// Get the browser/system language
function getBrowserLanguage() {
  const language = navigator.language || navigator.userLanguage || defaultLanguage;
  return language.startsWith('zh-TW') ? 'zh-TW' : (supportedLanguages[language] ? language : defaultLanguage);
}

// Load language messages
async function loadLanguageMessages(language) {
  if (messageCache[language]) {
    return messageCache[language];
  }
  
  try {
    const response = await fetch(`locales/${language}/messages.json`);
    if (!response.ok) {
      throw new Error(`Failed to load language file: ${language}`);
    }
    const messages = await response.json();
    messageCache[language] = messages;
    return messages;
  } catch (error) {
    console.error(`Error loading language '${language}':`, error);
    
    // If we failed to load the requested language and it's not the default,
    // try to load the default language instead
    if (language !== defaultLanguage) {
      console.log(`Falling back to default language: ${defaultLanguage}`);
      return loadLanguageMessages(defaultLanguage);
    }
    
    // If we can't even load the default language, return an empty object
    return {};
  }
}

// Initialize i18n
async function initI18n(explicitLanguage = null) {
  // If explicit language is provided, use it
  if (explicitLanguage && supportedLanguages[explicitLanguage]) {
    currentLanguage = explicitLanguage;
    console.log(`Using explicit language: ${currentLanguage}`);
  } else {
    // Try to get saved language preference
    const savedData = await chrome.storage.local.get('language');
    
    // If there's a saved language preference and it's supported, use it
    if (savedData.language && supportedLanguages[savedData.language]) {
      currentLanguage = savedData.language;
    } else {
      // Otherwise, use the browser language
      currentLanguage = getBrowserLanguage();
    }
  }
  
  // Load the language messages
  await loadLanguageMessages(currentLanguage);
  console.log(`Initialized i18n with language: ${currentLanguage}`);
  
  return currentLanguage;
}

// Get a translated message
function getMessage(key, ...args) {
  if (!messageCache[currentLanguage]) {
    console.warn(`Messages for language '${currentLanguage}' not loaded yet`);
    return key;
  }
  
  const message = messageCache[currentLanguage][key];
  
  if (!message) {
    console.warn(`Missing translation for key: ${key} in language: ${currentLanguage}`);
    // Try to get it from the default language
    if (currentLanguage !== defaultLanguage && messageCache[defaultLanguage]) {
      const defaultMessage = messageCache[defaultLanguage][key];
      if (defaultMessage) {
        return formatMessage(defaultMessage, ...args);
      }
    }
    return key;
  }
  
  return formatMessage(message, ...args);
}

// Format a message with placeholders
function formatMessage(message, ...args) {
  if (!args || args.length === 0) return message;
  
  return message.replace(/\{(\d+)\}/g, (match, index) => {
    const argIndex = Number(index);
    return argIndex < args.length ? args[argIndex] : match;
  });
}

// Change the current language
async function changeLanguage(language) {
  if (!supportedLanguages[language]) {
    console.error(`Unsupported language: ${language}`);
    return false;
  }
  
  try {
    // Load messages for the new language
    await loadLanguageMessages(language);
    
    // Update the current language
    currentLanguage = language;
    
    // Save the language preference locally
    await chrome.storage.local.set({ language });
    
    console.log(`Language changed to: ${language}`);
    return true;
  } catch (error) {
    console.error(`Failed to change language to ${language}:`, error);
    return false;
  }
}

// Get the current language
function getCurrentLanguage() {
  return currentLanguage;
}

// Get all supported languages
function getSupportedLanguages() {
  return supportedLanguages;
}

// Apply translations to DOM elements based on data-i18n attributes
function translatePage() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translated = getMessage(key);
    
    // Different handling based on element type
    if (element.tagName === 'INPUT' && element.type === 'placeholder') {
      element.placeholder = translated;
    } else if (element.tagName === 'INPUT' && element.type === 'value') {
      element.value = translated;
    } else {
      element.textContent = translated;
    }
  });
  
  // Also handle placeholders separately
  const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
  placeholders.forEach(element => {
    const key = element.getAttribute('data-i18n-placeholder');
    element.placeholder = getMessage(key);
  });
  
  // Handle titles (tooltips)
  const titles = document.querySelectorAll('[data-i18n-title]');
  titles.forEach(element => {
    const key = element.getAttribute('data-i18n-title');
    element.title = getMessage(key);
  });
}

// Create a language switcher element
function createLanguageSwitcher(container) {
  // Create a container for the language switcher
  const switcherContainer = document.createElement('div');
  switcherContainer.className = 'language-switcher';
  
  // Create the language button with icon
  const switcherButton = document.createElement('button');
  switcherButton.className = 'language-button';
  switcherButton.setAttribute('title', getMessage('switchLanguage'));
  
  // Add globe icon
  const icon = document.createElement('i');
  icon.className = 'fas fa-globe';
  switcherButton.appendChild(icon);
  
  // Create dropdown menu
  const dropdownContent = document.createElement('div');
  dropdownContent.className = 'language-dropdown-content';
  
  // Add language options
  Object.entries(supportedLanguages).forEach(([code, name]) => {
    const langOption = document.createElement('a');
    langOption.className = 'language-option';
    langOption.textContent = name;
    langOption.dataset.langCode = code;
    
    // Highlight current language
    if (code === currentLanguage) {
      langOption.classList.add('active');
    }
    
    // Add click event
    langOption.addEventListener('click', async () => {
      const changed = await changeLanguage(code);
      if (changed) {
        // Update dropdown active item
        document.querySelectorAll('.language-option').forEach(option => {
          option.classList.toggle('active', option.dataset.langCode === code);
        });
        
        // Translate the page
        translatePage();
        
        // Trigger a custom event for other components to handle
        window.dispatchEvent(new CustomEvent('languageChanged', {
          detail: { language: code }
        }));
      }
    });
    
    dropdownContent.appendChild(langOption);
  });
  
  // Toggle dropdown on button click
  switcherButton.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdownContent.classList.toggle('show');
  });
  
  // Close dropdown when clicking elsewhere
  document.addEventListener('click', () => {
    dropdownContent.classList.remove('show');
  });
  
  // Add to container
  switcherContainer.appendChild(switcherButton);
  switcherContainer.appendChild(dropdownContent);
  container.appendChild(switcherContainer);
}

export {
  initI18n,
  getMessage,
  getCurrentLanguage,
  getSupportedLanguages,
  changeLanguage,
  translatePage,
  createLanguageSwitcher
}; 