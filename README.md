# Better GitHub UX

A feature-rich Chrome extension designed to enhance your GitHub experience by providing advanced management for your repositories and starred items, including categorization and synchronization.

## Key Features

-   **GitHub Account Integration**: Securely log in using GitHub OAuth.
-   **Repository Management**: View a list of repositories you own.
-   **Starred Item Management**: Browse repositories you have starred.
-   **Categorization**:
    -   Create and manage custom categories.
    -   Assign repositories and starred items to one or more categories.
    -   Filter repositories and stars based on assigned categories.
-   **Data Synchronization**:
    -   Category data and language preferences are automatically synced to a private GitHub Gist.
    -   Ensures your setup is consistent across different devices.
    -   Handles data migration from older formats gracefully.
-   **Internationalization (i18n)**:
    -   Supports multiple languages (currently English and Traditional Chinese).
    -   Automatically detects browser language preference.
    -   Includes a language switcher to manually change the display language.
-   **Modern User Interface**: Clean, intuitive design focused on ease of use, including loading indicators and user feedback messages.

## Installation Guide

### Developer Installation

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/leoliu0605/better-github-ux.git
    cd better-github-ux
    ```

2.  **Create a GitHub OAuth Application**:
    -   Go to [GitHub Developer Settings](https://github.com/settings/developers).
    -   Click "New OAuth App".
    -   Fill in the application details:
        -   **Application name**: `Better GitHub UX` (or your preferred name)
        -   **Homepage URL**: Can be left blank or set to the repository URL.
        -   **Authorization callback URL**: This is crucial. After loading the extension in Chrome (see step 5), find the extension's ID in `chrome://extensions/`. The callback URL will be `https://<extension-id>.chromiumapp.org/`. (Replace `<extension-id>` with the actual ID).

3.  **Get OAuth Credentials**:
    -   Copy the generated **Client ID**.
    -   Generate a **Client Secret** and copy it. **Keep this secret secure!**

4.  **Configure the Extension**:
    -   Duplicate the `config.example.js` file and rename it to `config.js`.
    -   Open `config.js` and paste your **Client ID** and **Client Secret** into the respective fields.

5.  **Load the Extension in Chrome**:
    -   Open Chrome and navigate to `chrome://extensions/`.
    -   Enable "Developer mode" (usually a toggle in the top-right corner).
    -   Click "Load unpacked".
    -   Select the `better-github-ux` directory (the one you cloned).
    -   *(Now you can find the extension ID for the callback URL in step 2)*.

### User Installation (Once published)

1.  Navigate to the [Chrome Web Store](https://chrome.google.com/webstore/category/extensions).
2.  Search for "Better GitHub UX".
3.  Click "Add to Chrome".

## Usage

1.  Click the extension icon in your Chrome toolbar.
2.  On first use, click the "Connect with GitHub" button to log in.
3.  Authorize the application to access your GitHub account (requires `repo` and `user` scopes).
4.  Once logged in, you can:
    -   Switch between viewing your **Repositories** and **Stars** using the tabs.
    -   **Manage Categories**: Use the tag icon (<i class="fas fa-tags"></i>) button's dropdown to add or delete categories.
    -   **Sync Data**: Click the sync icon (<i class="fas fa-cloud-upload-alt"></i>) to manually sync category and language data with your GitHub Gist (it also syncs automatically on changes). The indicator next to it shows the sync status.
    -   **Assign Categories**: Click the tag icon (<i class="fas fa-tag"></i>) next to any repository or star to open the category assignment dialog or quickly add/remove categories from the dropdown.
    -   **Filter**: Use the dropdown menu above the tabs to filter the displayed items by category.
    -   **Switch Language**: Click the globe icon (<i class="fas fa-globe"></i>) in the top-right corner to change the display language.
    -   **Open in GitHub**: Click the external link icon (<i class="fas fa-external-link-alt"></i>) to open the repository/star page on GitHub.

## Data Synchronization

-   This extension uses a private GitHub Gist associated with your account to store your categories and language preferences.
-   This allows your settings to persist across different browser installations or devices where you are logged into both Chrome and GitHub.
-   The first time you make a change (like adding a category or changing the language), the extension will automatically create a Gist named `better-github-ux.json` with the description `Better GitHub UX - Categories Data`.
-   Synchronization happens automatically when changes are made and can also be triggered manually using the sync button.

## Privacy and Security

-   The extension requests only the necessary GitHub permissions (`repo` for accessing private/public repos and stars, `user` for basic profile info). The `gist` scope is implicitly included when creating the private Gist for sync, but the extension doesn't interact with other Gists.
-   All GitHub data is fetched directly from the GitHub API and processed locally in your browser. No data is sent to third-party servers.
-   Your GitHub access token is stored securely in Chrome's local storage (`chrome.storage.local`).
-   The category/language sync data is stored in a *private* Gist accessible only to you.
-   The source code is open and available for review.

## Technology Stack

-   **Frontend**: HTML5, CSS3, JavaScript (ES Modules)
-   **API**: GitHub REST API v3
-   **Authentication**: GitHub OAuth 2.0 (using `chrome.identity`)
-   **Storage**: Chrome Storage API (`chrome.storage.sync` for Gist ID, `chrome.storage.local` for token), GitHub Gist for category/language data.
-   **Icons**: Font Awesome

## Contributing

Contributions are welcome! Please follow these steps:

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

If you have any questions or suggestions, please open an issue on the GitHub repository.
