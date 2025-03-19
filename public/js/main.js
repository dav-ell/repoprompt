// public/js/main.js
// Main entry point for the application. Initializes state, attaches event listeners, and wires up all modules.

import { state, loadStateFromLocalStorage, saveStateToLocalStorage } from './state.js';
import { debounce } from './utils.js';
import { handleFileSelection } from './fileTree.js';
import { updateXMLPreview } from './xmlPreview.js';
import { generateFileExplorer } from './explorer.js';
import { checkConnection } from './connection.js';
import { loadPromptsFromStorage, renderPromptCheckboxes } from './prompts.js';
import { initPromptModal } from './promptModal.js';
import { handleZipUpload, handleFolderUpload } from './uploader.js';
import { refreshSelectedFiles } from './fileContent.js'; // Added for polling refresh

document.addEventListener('DOMContentLoaded', () => {
  // Load saved state from localStorage.
  loadStateFromLocalStorage();

  // Initialize UI elements with saved state.
  const directoryInput = document.getElementById('directory-path');
  if (state.rootDirectory) {
    directoryInput.value = state.rootDirectory;
  }
  const endpointInput = document.getElementById('endpoint-url');
  if (state.baseEndpoint) {
    endpointInput.value = state.baseEndpoint;
  }

  // Load available prompts from localStorage and render prompt checkboxes.
  loadPromptsFromStorage();
  renderPromptCheckboxes();

  // Initialize prompt modal functionality.
  initPromptModal();

  // If there is an uploaded file tree, use it to generate the file explorer;
  // otherwise, load from the server.
  if (state.uploadedFileTree) {
    import('./fileTree.js').then(module => {
      document.getElementById('file-list').innerHTML = module.renderFileTree(state.uploadedFileTree, "", true);
    });
    updateXMLPreview();
  } else {
    generateFileExplorer();
  }

  // Debounce updating the XML preview when user instructions change.
  const debouncedUpdate = debounce(() => {
    state.userInstructions = document.getElementById('user-instructions').value.trim() || "No instructions provided.";
    updateXMLPreview();
  }, 500);

  document.getElementById('user-instructions').addEventListener('input', debouncedUpdate);
  document.getElementById('file-list').addEventListener('click', handleFileSelection);
  
  // Copy XML to clipboard with feedback after refreshing file contents.
  document.getElementById('copy-btn').addEventListener('click', async () => {
    await refreshSelectedFiles(); // Refresh file contents before copying
    await updateXMLPreview(true); // Force full update after refresh
    const xmlText = document.getElementById('xml-output').textContent;
    const feedbackElement = document.getElementById('copy-feedback');
    
    navigator.clipboard.writeText(xmlText)
      .then(() => {
        feedbackElement.classList.add('show');
        console.log('XML copied to clipboard');
        setTimeout(() => {
          feedbackElement.classList.remove('show');
        }, 1000);
      })
      .catch(err => console.error('Failed to copy XML: ', err));
  });

  // Update directory when the user clicks the update button.
  document.getElementById('update-directory').addEventListener('click', async function() {
    state.rootDirectory = document.getElementById('directory-path').value.trim();
    if (!state.rootDirectory) {
      alert('Please enter a valid directory path');
      return;
    }
    console.log(`Updating directory to: ${state.rootDirectory}`);
    // Clear any previously uploaded file data if a directory is manually specified.
    state.uploadedFileTree = null;
    state.uploadedFiles = {};
    await generateFileExplorer();
    saveStateToLocalStorage();
  });

  // Check connection when the user clicks the connect button.
  document.getElementById('connect-endpoint').addEventListener('click', checkConnection);

  // Setup the upload button and file input event listeners.
  const uploadBtn = document.getElementById('upload-btn');
  const zipInput = document.getElementById('zip-upload');
  uploadBtn.addEventListener('click', () => {
    zipInput.click();
  });
  zipInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file) {
      await handleZipUpload(file);
    }
  });

  // Setup the folder upload button and file input event listeners.
  const uploadFolderBtn = document.getElementById('upload-folder-btn');
  const folderInput = document.getElementById('folder-upload');
  uploadFolderBtn.addEventListener('click', () => {
    folderInput.click();
  });
  folderInput.addEventListener('change', async (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      await handleFolderUpload(files);
    }
  });

  // Start polling for file updates
  startPolling();
});

/**
 * Starts polling to refresh selected file contents every 10 seconds.
 */
function startPolling() {
  const POLLING_INTERVAL = 10000; // 10 seconds in milliseconds

  const poll = async () => {
    if (!state.uploadedFileTree) { // Only poll if not using an uploaded zip or folder
      console.log('Polling for file updates...');
      await refreshSelectedFiles();
      await updateXMLPreview(true); // Force full update
    }
  };

  // Initial call
  poll();

  // Set interval for subsequent polls
  const intervalId = setInterval(poll, POLLING_INTERVAL);

  // Cleanup on window unload to prevent memory leaks
  window.addEventListener('unload', () => {
    clearInterval(intervalId);
    console.log('Polling stopped due to window unload');
  });
}