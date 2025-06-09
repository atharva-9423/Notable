// Service Worker Registration and Offline Support
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then(reg => {
        console.log("Service Worker Registered!", reg);
        
        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New version available, could show update notification
              console.log('New version available!');
            }
          });
        });
      })
      .catch(err => console.error("Service Worker Failed:", err));
  });
}

// Online/Offline Detection
class OfflineManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.createOfflineIndicator();
    this.bindEvents();
  }

  createOfflineIndicator() {
    this.offlineIndicator = document.createElement('div');
    this.offlineIndicator.className = 'offline-indicator';
    this.offlineIndicator.innerHTML = `
      <i data-lucide="wifi-off"></i>
      <span>You're offline. Changes will sync when connection is restored.</span>
    `;
    document.body.appendChild(this.offlineIndicator);
  }

  bindEvents() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.hideOfflineIndicator();
      this.syncPendingChanges();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.showOfflineIndicator();
    });

    // Initial state check
    if (!this.isOnline) {
      this.showOfflineIndicator();
    }
  }

  showOfflineIndicator() {
    this.offlineIndicator.classList.add('show');
    // Re-initialize icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  hideOfflineIndicator() {
    this.offlineIndicator.classList.remove('show');
  }

  syncPendingChanges() {
    // Trigger background sync if supported
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      navigator.serviceWorker.ready.then(registration => {
        return registration.sync.register('notes-sync');
      }).catch(err => {
        console.log('Background sync registration failed:', err);
      });
    }
  }
}

class NotesApp {
  constructor() {
    this.notebooks = JSON.parse(localStorage.getItem('notebooks')) || [];
    this.notes = JSON.parse(localStorage.getItem('notes')) || [];
    this.trashedItems = JSON.parse(localStorage.getItem('trashedItems')) || [];
    this.passwords = JSON.parse(localStorage.getItem('passwords')) || [];
    this.currentNoteId = null;
    this.currentNotebookId = null;
    this.autoSaveTimeout = null;
    this.transitionTimeout = null;
    this.autoSaveIndicator = null;
    this.currentTextSize = localStorage.getItem('textSize') || 'medium';
    this.isTouchDevice = 'ontouchstart' in window;
    this.editorHistory = [];
    this.historyIndex = -1;
    this.maxHistorySize = 100;
    this.isTrashOpen = false;
    this.deskCurrentIndex = 0;
    this.deskCardsPerView = 3;
    this.isUndoRedoAction = false;
    this.filteredPasswords = [];
    this.trashOutsideClickHandler = null;
    this.init();
  }

  init() {
    this.createAutoSaveIndicator();
    this.initResponsiveFeatures();
    this.initOfflineSupport();
    this.bindEvents();
    this.renderNotesList();
    this.updateDeskView();
    this.updatePasswordStats();
    this.addInitialAnimations();
    this.cleanupExpiredTrashItems();
    this.renderTrashList();
  }

  initOfflineSupport() {
    this.offlineManager = new OfflineManager();
  }

  initResponsiveFeatures() {
    if (this.isTouchDevice) {
      document.body.classList.add('touch-friendly');
    }

    this.applyTextSize(this.currentTextSize);
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.handleResize(), 100);
    });
  }

  handleResize() {
    const width = window.innerWidth;
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (width > 768) {
      sidebar.classList.remove('open');
      overlay.classList.remove('show');
    }
  }

  applyTextSize(size) {
    document.body.classList.remove('text-small', 'text-medium', 'text-large', 'text-extra-large');
    document.body.classList.add(`text-${size}`);

    document.querySelectorAll('.text-size-btn').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.size === size) {
        btn.classList.add('active');
      }
    });

    localStorage.setItem('textSize', size);
    this.currentTextSize = size;
  }

  createAutoSaveIndicator() {
    this.autoSaveIndicator = document.createElement('div');
    this.autoSaveIndicator.className = 'auto-save-indicator';
    this.autoSaveIndicator.textContent = 'Saved';
    document.body.appendChild(this.autoSaveIndicator);
  }

  showAutoSaveIndicator(status = 'saved') {
    const indicator = this.autoSaveIndicator;
    indicator.classList.remove('saving', 'error');

    switch (status) {
      case 'saving':
        indicator.textContent = 'Saving...';
        indicator.classList.add('saving');
        break;
      case 'saved':
        indicator.textContent = 'Saved';
        break;
      case 'error':
        indicator.textContent = 'Save failed';
        indicator.classList.add('error');
        break;
    }

    indicator.classList.add('show');
    setTimeout(() => {
      indicator.classList.remove('show');
    }, 2000);
  }

  addInitialAnimations() {
    const dashboard = document.getElementById('dashboardContainer');
    if (dashboard && dashboard.style.display !== 'none') {
      dashboard.classList.add('fade-in');
    }

    const cards = document.querySelectorAll('.notebook-card');
    cards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.1}s`;
      card.classList.add('bounce-in');
    });
  }

  bindEvents() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    mobileMenuToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('show');
    });

    sidebarOverlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('show');
    });

    const closeMobileMenu = () => {
      if (window.innerWidth <= 768) {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
      }
    };

    document.getElementById('newNoteBtn').addEventListener('click', (e) => {
      this.addClickAnimation(e.target);
      closeMobileMenu();
      this.createNewNote();
    });

    document.querySelectorAll('.notebook-card').forEach(card => {
      card.addEventListener('click', (e) => {
        this.addClickAnimation(card);
        const type = card.dataset.type;
        setTimeout(() => {
          this.createNewNotebook(type);
        }, 200);
      });
    });

    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => {
        this.addClickAnimation(e.target);
        closeMobileMenu();
        this.showDashboard();
      });
    }

    const notebookBackBtn = document.getElementById('notebookBackBtn');
    if (notebookBackBtn) {
      notebookBackBtn.addEventListener('click', (e) => {
        this.addClickAnimation(e.target);
        closeMobileMenu();
        this.showDashboard();
      });
    }

    const openNotebookBtn = document.getElementById('openNotebookBtn');
    if (openNotebookBtn) {
      openNotebookBtn.addEventListener('click', (e) => {
        this.addClickAnimation(e.target);
        setTimeout(() => {
          this.openNotebookForEditing();
        }, 300);
      });
    }

    const noteTitle = document.getElementById('noteTitle');
    const noteContentEditor = document.getElementById('noteContentEditor');

    noteTitle.addEventListener('input', () => {
      this.debouncedAutoSave();
    });

    // Handle paste events for title to only paste plain text
    noteTitle.addEventListener('paste', (e) => {
      e.preventDefault();

      // Get plain text from clipboard
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');

      if (text) {
        // Remove line breaks from title and insert at cursor
        const cleanText = text.replace(/[\r\n]+/g, ' ').trim();

        const start = noteTitle.selectionStart;
        const end = noteTitle.selectionEnd;
        const currentValue = noteTitle.value;

        // Insert text at cursor position
        noteTitle.value = currentValue.substring(0, start) + cleanText + currentValue.substring(end);

        // Set cursor position after inserted text
        const newCursorPos = start + cleanText.length;
        noteTitle.setSelectionRange(newCursorPos, newCursorPos);

        this.debouncedAutoSave();
      }
    });

    // Save state on significant changes with debouncing
    let inputTimeout;
    noteContentEditor.addEventListener('input', () => {
      // Skip saving state during undo/redo operations
      if (this.isUndoRedoAction) {
        this.debouncedAutoSave();
        return;
      }
      
      // Clear previous timeout
      if (inputTimeout) {
        clearTimeout(inputTimeout);
      }
      
      // Save state after a short delay to avoid saving on every keystroke
      inputTimeout = setTimeout(() => {
        this.saveEditorState();
      }, 1000);
      
      this.debouncedAutoSave();
    });

    // Save state on focus (when user starts editing)
    noteContentEditor.addEventListener('focus', () => {
      this.saveEditorState();
    });

    // Save state on selection change (for formatting operations)
    noteContentEditor.addEventListener('mouseup', () => {
      setTimeout(() => {
        this.saveEditorState();
      }, 100);
    });

    noteContentEditor.addEventListener('keyup', (e) => {
      // Save state on certain key combinations that might change content structure
      if (e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') {
        setTimeout(() => {
          this.saveEditorState();
        }, 100);
      }
    });

    // Handle paste events to only paste plain text
    noteContentEditor.addEventListener('paste', (e) => {
      e.preventDefault();

      // Get plain text from clipboard
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');

      if (text) {
        // Insert plain text at cursor position
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();

          // Split text by line breaks and create paragraphs
          const lines = text.split('\n');
          const fragment = document.createDocumentFragment();

          lines.forEach((line, index) => {
            if (line.trim() === '') {
              // Insert a line break for empty lines
              if (index > 0) {
                fragment.appendChild(document.createElement('br'));
              }
            } else {
              // Create text node for non-empty lines
              const textNode = document.createTextNode(line);
              fragment.appendChild(textNode);

              // Add line break if not the last line
              if (index < lines.length - 1) {
                fragment.appendChild(document.createElement('br'));
              }
            }
          });

          range.insertNode(fragment);

          // Move cursor to end of inserted content
          range.collapse(false);
          selection.removeAllRanges();
          selection.addRange(range);
        }

        this.debouncedAutoSave();
      }
    });

    noteTitle.addEventListener('blur', () => {
      this.saveCurrentNote();
    });

    noteContentEditor.addEventListener('blur', () => {
      this.saveCurrentNote();
    });

    // Rich text editor toolbar events
    this.bindToolbarEvents();

    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          this.saveCurrentNote();
          this.showAutoSaveIndicator('saved');
        }
        // Handle keyboard shortcuts for formatting
        this.handleKeyboardShortcuts(e);
      }
    });

    // Trash functionality
    const trashToggleBtn = document.getElementById('trashToggleBtn');
    if (trashToggleBtn) {
      trashToggleBtn.addEventListener('click', () => {
        this.toggleTrash();
      });
    }

    const emptyTrashBtn = document.getElementById('emptyTrashBtn');
    if (emptyTrashBtn) {
      emptyTrashBtn.addEventListener('click', () => {
        this.emptyTrash();
      });
    }

    // Desk navigation
    const deskPrevBtn = document.getElementById('deskPrevBtn');
    const deskNextBtn = document.getElementById('deskNextBtn');

    if (deskPrevBtn) {
      deskPrevBtn.addEventListener('click', () => {
        this.navigateDesk('prev');
      });
    }

    if (deskNextBtn) {
      deskNextBtn.addEventListener('click', () => {
        this.navigateDesk('next');
      });
    }

    // Password manager events
    const addPasswordBtn = document.getElementById('addPasswordBtn');
    const generatePasswordBtn = document.getElementById('generatePasswordBtn');
    const viewPasswordsBtn = document.getElementById('viewPasswordsBtn');
    const addPasswordFromViewBtn = document.getElementById('addPasswordFromViewBtn');
    const passwordSearchInput = document.getElementById('passwordSearchInput');
    const passwordManagerBackBtn = document.getElementById('passwordManagerBackBtn');

    if (addPasswordBtn) {
      addPasswordBtn.addEventListener('click', () => {
        this.showAddPasswordModal();
      });
    }

    if (generatePasswordBtn) {
      generatePasswordBtn.addEventListener('click', () => {
        this.showPasswordGeneratorModal();
      });
    }

    if (viewPasswordsBtn) {
      viewPasswordsBtn.addEventListener('click', () => {
        this.showPasswordManagerView();
      });
    }

    if (addPasswordFromViewBtn) {
      addPasswordFromViewBtn.addEventListener('click', () => {
        this.showAddPasswordModal();
      });
    }

    if (passwordSearchInput) {
      passwordSearchInput.addEventListener('input', (e) => {
        this.filterPasswords(e.target.value);
      });
    }

    if (passwordManagerBackBtn) {
      passwordManagerBackBtn.addEventListener('click', () => {
        this.showDashboard();
      });
    }
  }

  bindToolbarEvents() {
    // Safely bind formatting buttons with faster event handling
    const toolbarButtons = [
      { id: 'boldBtn', command: 'bold' },
      { id: 'italicBtn', command: 'italic' },
      { id: 'underlineBtn', command: 'underline' },
      { id: 'strikeBtn', command: 'strikeThrough' },
      { id: 'bulletListBtn', command: 'insertUnorderedList' },
      { id: 'numberListBtn', command: 'insertOrderedList' },
      { id: 'alignLeftBtn', command: 'justifyLeft' },
      { id: 'alignCenterBtn', command: 'justifyCenter' },
      { id: 'alignRightBtn', command: 'justifyRight' }
    ];

    // Handle undo/redo buttons separately with manual implementation
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
      undoBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.performUndo();
      });
      undoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    if (redoBtn) {
      redoBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.performRedo();
      });
      redoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }

    toolbarButtons.forEach(({ id, command }) => {
      const btn = document.getElementById(id);
      if (btn) {
        // Use mousedown for faster response
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.execCommand(command);
        });

        // Also handle touch events for mobile
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.execCommand(command);
        }, { passive: false });

        // Prevent context menu on right click
        btn.addEventListener('contextmenu', (e) => {
          e.preventDefault();
        });
      }
    });

    // Special formatting buttons with faster event handling
    const linkBtn = document.getElementById('linkBtn');
    if (linkBtn) {
      linkBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.insertLink();
      });
      linkBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.insertLink();
      }, { passive: false });
    }

    const codeBtn = document.getElementById('codeBtn');
    if (codeBtn) {
      codeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.wrapSelection('code');
      });
      codeBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.wrapSelection('code');
      }, { passive: false });
    }

    const quoteBtn = document.getElementById('quoteBtn');
    if (quoteBtn) {
      quoteBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.applyQuoteFormatting();
      });
      quoteBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.applyQuoteFormatting();
      }, { passive: false });
    }

    // Image upload button
    const imageBtn = document.getElementById('imageBtn');
    const imageUpload = document.getElementById('imageUpload');

    if (imageBtn && imageUpload) {
      imageBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        imageUpload.click();
      });
      imageBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        imageUpload.click();
      }, { passive: false });

      imageUpload.addEventListener('change', (e) => {
        this.handleImageUpload(e);
      });
    }

    // Heading selector with immediate response
    const headingSelect = document.getElementById('headingSelect');
    if (headingSelect) {
      headingSelect.addEventListener('change', (e) => {
        this.execCommand('formatBlock', e.target.value);
      });
      // Also handle input event for immediate feedback
      headingSelect.addEventListener('input', (e) => {
        this.execCommand('formatBlock', e.target.value);
      });
    }

    // Color pickers with immediate response
    const textColorPicker = document.getElementById('textColorPicker');
    if (textColorPicker && typeof textColorPicker.addEventListener === 'function') {
      // Use input event for real-time color changes
      textColorPicker.addEventListener('input', (e) => {
        e.preventDefault();
        this.execCommand('foreColor', e.target.value);
      });
      textColorPicker.addEventListener('change', (e) => {
        e.preventDefault();
        this.execCommand('foreColor', e.target.value);
      });
    }

    const bgColorPicker = document.getElementById('bgColorPicker');
    if (bgColorPicker && typeof bgColorPicker.addEventListener === 'function') {
      // Use input event for real-time color changes
      bgColorPicker.addEventListener('input', (e) => {
        e.preventDefault();
        this.execCommand('backColor', e.target.value);
      });
      bgColorPicker.addEventListener('change', (e) => {
        e.preventDefault();
        this.execCommand('backColor', e.target.value);
      });
    }

    // Update toolbar state on selection change with throttling
    const noteContentEditor = document.getElementById('noteContentEditor');
    if (noteContentEditor) {
      let updateTimeout;

      const throttledUpdate = () => {
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }
        updateTimeout = setTimeout(() => {
          this.updateToolbarState();
        }, 50);
      };

      noteContentEditor.addEventListener('selectionchange', throttledUpdate);
      noteContentEditor.addEventListener('mouseup', throttledUpdate);
      noteContentEditor.addEventListener('keyup', throttledUpdate);
      noteContentEditor.addEventListener('focus', throttledUpdate);
    }

    // Global selection change with throttling
    let globalUpdateTimeout;
    document.addEventListener('selectionchange', () => {
      if (globalUpdateTimeout) {
        clearTimeout(globalUpdateTimeout);
      }
      globalUpdateTimeout = setTimeout(() => {
        this.updateToolbarState();
      }, 100);
    });
  }

  handleKeyboardShortcuts(e) {
    const editor = document.getElementById('noteContentEditor');
    if (!editor || document.activeElement !== editor) return;

    switch (e.key.toLowerCase()) {
      case 'z':
        e.preventDefault();
        if (e.shiftKey || e.ctrlKey && e.shiftKey) {
          this.performRedo();
        } else {
          this.performUndo();
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.performRedo();
        }
        break;
      case 'b':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.execCommand('bold');
        }
        break;
      case 'i':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.execCommand('italic');
        }
        break;
      case 'u':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this.execCommand('underline');
        }
        break;
    }
  }

  execCommand(command, value = null) {
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    // Focus the editor first
    editor.focus();

    // Save state before any formatting change
    if (command !== 'undo' && command !== 'redo') {
      this.saveEditorState();
    }

    try {
      if (command === 'foreColor' || command === 'backColor') {
        // Handle color commands specially
        if (value && document.queryCommandSupported && document.queryCommandSupported(command)) {
          const success = document.execCommand(command, false, value);
          if (!success) {
            console.warn(`Color command ${command} failed, trying alternative approach`);
            // Alternative approach for color styling
            this.applyColorToSelection(command, value);
          }
        }
      } else if (command === 'bold' && document.queryCommandSupported && document.queryCommandSupported('bold')) {
        document.execCommand(command, false, value);
      } else if (command === 'italic' && document.queryCommandSupported && document.queryCommandSupported('italic')) {
        document.execCommand(command, false, value);
      } else if (command === 'underline' && document.queryCommandSupported && document.queryCommandSupported('underline')) {
        document.execCommand(command, false, value);
      } else if (document.queryCommandSupported && document.queryCommandSupported(command)) {
        document.execCommand(command, false, value);
      } else {
        // Fallback for unsupported commands
        console.warn(`Command ${command} not supported`);
      }
    } catch (error) {
      console.error(`Error executing command ${command}:`, error);
    }

    this.updateToolbarState();
    this.debouncedAutoSave();
  }

  applyColorToSelection(command, color) {
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    if (selectedText) {
      try {
        const span = document.createElement('span');
        if (command === 'foreColor') {
          span.style.color = color;
        } else if (command === 'backColor') {
          span.style.backgroundColor = color;
        }

        span.textContent = selectedText;
        range.deleteContents();
        range.insertNode(span);

        // Clear selection
        selection.removeAllRanges();

        this.debouncedAutoSave();
      } catch (error) {
        console.error(`Error applying color ${command}:`, error);
      }
    }
  }

  applyQuoteFormatting() {
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      alert('Please select some text to apply quote formatting.');
      return;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) {
      alert('Please select some text to apply quote formatting.');
      return;
    }

    try {
      editor.focus();

      // Save current state for manual undo support
      this.saveEditorState();

      // Try using execCommand first for better undo support
      try {
        const success = document.execCommand('insertHTML', false, `<blockquote>${selectedText}</blockquote>`);
        if (!success) {
          throw new Error('execCommand failed');
        }
      } catch (execError) {
        // Fallback to manual insertion
        const range = selection.getRangeAt(0);
        const blockquote = document.createElement('blockquote');
        blockquote.textContent = selectedText;

        range.deleteContents();
        range.insertNode(blockquote);

        // Position cursor after the blockquote
        const newRange = document.createRange();
        newRange.setStartAfter(blockquote);
        newRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(newRange);
      }

      this.debouncedAutoSave();
    } catch (error) {
      console.error('Error applying quote formatting:', error);
      // Final fallback to formatBlock
      try {
        this.execCommand('formatBlock', 'blockquote');
      } catch (fallbackError) {
        console.error('All quote formatting methods failed:', fallbackError);
      }
    }
  }

  insertLink() {
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      alert('Please select some text first to create a link.');
      return;
    }

    const selectedText = selection.toString();
    if (!selectedText) {
      alert('Please select some text first to create a link.');
      return;
    }

    const url = prompt('Enter the URL:', 'https://');
    if (url && url.trim()) {
      try {
        editor.focus();
        this.execCommand('createLink', url.trim());
      } catch (error) {
        console.error('Error creating link:', error);
        // Fallback method
        const range = selection.getRangeAt(0);
        const link = document.createElement('a');
        link.href = url.trim();
        link.textContent = selectedText;
        range.deleteContents();
        range.insertNode(link);
        this.debouncedAutoSave();
      }
    }
  }

  wrapSelection(tag) {
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      alert('Please select some text first.');
      return;
    }

    const selectedText = selection.toString();
    if (!selectedText.trim()) {
      alert('Please select some text first.');
      return;
    }

    try {
      editor.focus();

      // Save current state for manual undo support
      this.saveEditorState();

      // Try using execCommand first for better undo support
      if (tag === 'code') {
        // For code, we'll use a span with styling instead of code tag for better undo support
        const success = document.execCommand('insertHTML', false, `<code>${selectedText}</code>`);
        if (!success) {
          // Fallback to manual insertion
          this.manualWrapSelection(tag, selectedText);
        }
      } else {
        // For other tags, use manual insertion
        this.manualWrapSelection(tag, selectedText);
      }

      this.debouncedAutoSave();
    } catch (error) {
      console.error(`Error wrapping selection with ${tag}:`, error);
    }
  }

  manualWrapSelection(tag, selectedText) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);

    const element = document.createElement(tag);
    element.textContent = selectedText;
    range.deleteContents();
    range.insertNode(element);

    // Position cursor after the inserted element
    const newRange = document.createRange();
    newRange.setStartAfter(element);
    newRange.collapse(true);
    selection.removeAllRanges();
    selection.addRange(newRange);
  }

  handleImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB in bytes
    if (file.size > maxSize) {
      alert('Image file is too large. Please select an image under 5MB.');
      return;
    }

    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    editor.focus();

    // Create a placeholder while loading
    const placeholder = document.createElement('div');
    placeholder.className = 'image-placeholder';
    placeholder.innerHTML = `
      <i data-lucide="loader"></i>
      <span>Loading image...</span>
    `;

    // Insert placeholder at cursor position
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.insertNode(placeholder);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editor.appendChild(placeholder);
    }

    // Re-initialize icons for the placeholder
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Convert file to base64 data URL
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;

      // Create resizable image container
      const imageContainer = this.createResizableImageContainer(dataUrl, file.name);

      // Replace placeholder with resizable image container
      placeholder.parentNode.replaceChild(imageContainer, placeholder);

      // Position cursor at the end of the editor content
      const range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);

      // Focus the editor to ensure cursor visibility
      editor.focus();

      // Re-initialize lucide icons
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }

      // Trigger auto-save
      this.debouncedAutoSave();
    };

    reader.onerror = () => {
      placeholder.innerHTML = `
        <i data-lucide="alert-circle"></i>
        <span>Failed to load image</span>
      `;

      // Re-initialize icons for error state
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    };

    reader.readAsDataURL(file);

    // Clear the input so the same file can be uploaded again
    event.target.value = '';
  }

  reinitializeImageEventListeners() {
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    const imageContainers = editor.querySelectorAll('.resizable-image-container');

    imageContainers.forEach(container => {
      // Remove existing listeners by cloning the element
      const newContainer = container.cloneNode(true);
      container.parentNode.replaceChild(newContainer, container);

      // Re-add all event listeners
      this.addImageEventListeners(newContainer);
    });
  }

  addImageEventListeners(container) {
    const img = container.querySelector('img');
    const dragHandle = container.querySelector('.drag-handle');
    const resizeHandle = container.querySelector('.resize-handle');
    const sizeControls = container.querySelectorAll('.size-control-btn');

    // Add click handler to view full size
    if (img) {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showImageModal(img.src, img.alt);
      });
    }

    // Add size control buttons
    sizeControls.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveEditorState(); // Save state before change

        const size = btn.dataset.size || btn.textContent;
        const sizes = {
          'S': { width: '150px', height: '100px' },
          'M': { width: '300px', height: '200px' },
          'L': { width: '450px', height: '300px' },
          'XL': { width: '600px', height: '400px' }
        };

        if (sizes[size]) {
          container.style.width = sizes[size].width;
          container.style.height = sizes[size].height;
        }

        this.saveEditorState(); // Save state after change
        this.debouncedAutoSave();
      });
    });

    // Add resize functionality
    if (resizeHandle) {
      let isResizing = false;
      let startX, startY, startWidth, startHeight;
      let animationFrame = null;

      const handleResize = (e) => {
        if (!isResizing) return;

        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }

        animationFrame = requestAnimationFrame(() => {
          const width = startWidth + e.clientX - startX;
          const height = startHeight + e.clientY - startY;

          const minWidth = 100;
          const minHeight = 100;
          const maxWidth = 800;
          const maxHeight = 600;

          const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
          const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, height));

          container.style.width = constrainedWidth + 'px';
          container.style.height = constrainedHeight + 'px';
        });
      };

      const stopResize = () => {
        isResizing = false;

        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
          animationFrame = null;
        }

        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);

        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        this.saveEditorState(); // Save state after resize
        this.debouncedAutoSave();
      };

      resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.saveEditorState(); // Save state before resize

        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(container).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(container).height, 10);

        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';

        document.addEventListener('mousemove', handleResize, { passive: true });
        document.addEventListener('mouseup', stopResize);
      });
    }

    // Add drag functionality
    if (dragHandle) {
      let isDragging = false;
      let dragStartX, dragStartY;
      let dragAnimationFrame = null;

      const startDrag = (e) => {
        if (!e.target.closest('.drag-handle')) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        this.saveEditorState(); // Save state before drag

        isDragging = true;

        const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
        const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;

        const containerRect = container.getBoundingClientRect();
        dragStartX = clientX - containerRect.left;
        dragStartY = clientY - containerRect.top;

        container.style.position = 'absolute';
        container.style.zIndex = '25';
        container.style.cursor = 'grabbing';

        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';

        if (e.type === 'mousedown') {
          document.addEventListener('mousemove', handleDrag);
          document.addEventListener('mouseup', stopDrag);
        } else {
          document.addEventListener('touchmove', handleDrag, { passive: false });
          document.addEventListener('touchend', stopDrag);
        }
      };

      const handleDrag = (e) => {
        if (!isDragging) return;

        if (e.type === 'touchmove') {
          e.preventDefault();
        }

        if (dragAnimationFrame) {
          cancelAnimationFrame(dragAnimationFrame);
        }

        dragAnimationFrame = requestAnimationFrame(() => {
          const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
          const clientY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;

          const editor = container.parentElement;
          if (editor) {
            const editorRect = editor.getBoundingClientRect();
            const containerWidth = parseInt(container.style.width);
            const containerHeight = parseInt(container.style.height);

            let newLeft = clientX - editorRect.left - dragStartX;
            let newTop = clientY - editorRect.top - dragStartY;

            const padding = 10;
            newLeft = Math.max(padding, Math.min(editor.clientWidth - containerWidth - padding, newLeft));
            newTop = Math.max(padding, Math.min(editor.clientHeight - containerHeight - padding, newTop));

            container.style.left = newLeft + 'px';
            container.style.top = newTop + 'px';
          }
        });
      };

      const stopDrag = () => {
        isDragging = false;

        if (dragAnimationFrame) {
          cancelAnimationFrame(dragAnimationFrame);
          dragAnimationFrame = null;
        }

        container.style.zIndex = '10';
        container.style.cursor = '';
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';

        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchmove', handleDrag);
        document.removeEventListener('touchend', stopDrag);

        this.saveEditorState(); // Save state after drag
        this.debouncedAutoSave();
      };

      dragHandle.addEventListener('mousedown', startDrag);
      dragHandle.addEventListener('touchstart', startDrag, { passive: false });
    }
  }

  createResizableImageContainer(imageSrc, imageName) {
    // Create container
    const container = document.createElement('div');
    container.className = 'resizable-image-container';
    container.style.width = '300px';
    container.style.height = '200px';
    container.style.position = 'absolute';
    container.style.display = 'block';
    container.style.left = '50px';
    container.style.top = '50px';
    container.style.zIndex = '10';
    container.style.margin = '0';

    // Create image
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = imageName;
    img.title = imageName;
    img.draggable = false;

    // Add click handler to view full size
    img.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showImageModal(imageSrc, imageName);
    });

    // Create size controls
    const sizeControls = document.createElement('div');
    sizeControls.className = 'image-size-controls';

    // Size control buttons
    const sizes = [
      { label: 'S', width: '150px', height: '100px' },
      { label: 'M', width: '300px', height: '200px' },
      { label: 'L', width: '450px', height: '300px' },
      { label: 'XL', width: '600px', height: '400px' }
    ];

    sizes.forEach(size => {
      const btn = document.createElement('button');
      btn.className = 'size-control-btn';
      btn.textContent = size.label;
      btn.title = `Resize to ${size.width} × ${size.height}`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        container.style.width = size.width;
        container.style.height = size.height;
        this.debouncedAutoSave();
      });

      sizeControls.appendChild(btn);
    });

    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';

    // Create drag handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'drag-handle';
    dragHandle.innerHTML = '<i data-lucide="move"></i>';
    dragHandle.title = 'Drag to move image';

    // Add resize functionality with improved performance
    let isResizing = false;
    let startX, startY, startWidth, startHeight;
    let animationFrame = null;

    const handleResize = (e) => {
      if (!isResizing) return;

      // Cancel previous animation frame
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      // Use requestAnimationFrame for smooth updates
      animationFrame = requestAnimationFrame(() => {
        const width = startWidth + e.clientX - startX;
        const height = startHeight + e.clientY - startY;

        // Apply minimum and maximum constraints
        const minWidth = 100;
        const minHeight = 100;
        const maxWidth = 800;
        const maxHeight = 600;

        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
        const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, height));

        container.style.width = constrainedWidth + 'px';
        container.style.height = constrainedHeight + 'px';
      });
    };

    const stopResize = () => {
      isResizing = false;

      // Cancel any pending animation frame
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }

      document.removeEventListener('mousemove', handleResize);
      document.removeEventListener('mouseup', stopResize);

      // Remove user-select disable
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      this.debouncedAutoSave();
    };

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = parseInt(document.defaultView.getComputedStyle(container).width, 10);
      startHeight = parseInt(document.defaultView.getComputedStyle(container).height, 10);

      // Disable text selection during resize
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      document.addEventListener('mousemove', handleResize, { passive: true });
      document.addEventListener('mouseup', stopResize);
    });

    // Add drag functionality with improved positioning
    let isDragging = false;
    let dragStartX, dragStartY;
    let dragAnimationFrame = null;

    const startDrag = (e) => {
      // Only allow dragging if clicking on the drag handle
      if (!e.target.closest('.drag-handle')) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      isDragging = true;

      const clientX = e.type === 'mousedown' ? e.clientX : e.touches[0].clientX;
      const clientY = e.type === 'mousedown' ? e.clientY : e.touches[0].clientY;

      // Get the container's current position relative to the editor
      const containerRect = container.getBoundingClientRect();
      const editorRect = container.parentElement.getBoundingClientRect();

      // Store the offset from the mouse to the container's top-left corner
      dragStartX = clientX - containerRect.left;
      dragStartY = clientY - containerRect.top;

      // Ensure absolute positioning
      container.style.position = 'absolute';
      container.style.zIndex = '25';
      container.style.cursor = 'grabbing';

      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';

      if (e.type === 'mousedown') {
        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', stopDrag);
      } else {
        document.addEventListener('touchmove', handleDrag, { passive: false });
        document.addEventListener('touchend', stopDrag);
      }
    };

    const handleDrag = (e) => {
      if (!isDragging) return;

      if (e.type === 'touchmove') {
        e.preventDefault();
      }

      if (dragAnimationFrame) {
        cancelAnimationFrame(dragAnimationFrame);
      }

      dragAnimationFrame = requestAnimationFrame(() => {
        const clientX = e.type === 'mousemove' ? e.clientX : e.touches[0].clientX;
        const clientY = e.type === 'mousemove' ? e.clientY : e.touches[0].clientY;

        // Get editor boundaries
        const editor = container.parentElement;
        if (editor) {
          const editorRect = editor.getBoundingClientRect();
          const containerWidth = parseInt(container.style.width);
          const containerHeight = parseInt(container.style.height);

          // Calculate new position relative to editor
          let newLeft = clientX - editorRect.left - dragStartX;
          let newTop = clientY - editorRect.top - dragStartY;

          // Keep within editor bounds with padding
          const padding = 10;
          newLeft = Math.max(padding, Math.min(editor.clientWidth - containerWidth - padding, newLeft));
          newTop = Math.max(padding, Math.min(editor.clientHeight - containerHeight - padding, newTop));

          // Update position
          container.style.left = newLeft + 'px';
          container.style.top = newTop + 'px';
        }
      });
    };

    const stopDrag = () => {
      isDragging = false;

      if (dragAnimationFrame) {
        cancelAnimationFrame(dragAnimationFrame);
        dragAnimationFrame = null;
      }

      // Keep absolute positioning after drag
      container.style.zIndex = '10';
      container.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', stopDrag);
      document.removeEventListener('touchmove', handleDrag);
      document.removeEventListener('touchend', stopDrag);

      this.debouncedAutoSave();
    };

    // Add drag event listeners only to the drag handle
    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });

    // Add touch support for mobile resize
    resizeHandle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      isResizing = true;
      startX = touch.clientX;
      startY = touch.clientY;
      startWidth = parseInt(document.defaultView.getComputedStyle(container).width, 10);
      startHeight = parseInt(document.defaultView.getComputedStyle(container).height, 10);

      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
    }, { passive: false });

    const handleTouchResize = (e) => {
      if (!isResizing) return;
      e.preventDefault();

      const touch = e.touches[0];

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }

      animationFrame = requestAnimationFrame(() => {
        const width = startWidth + touch.clientX - startX;
        const height = startHeight + touch.clientY - startY;

        const minWidth = 100;
        const minHeight = 100;
        const maxWidth = 800;
        const maxHeight = 600;

        const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, width));
        const constrainedHeight = Math.max(minHeight, Math.min(maxHeight, height));

        container.style.width = constrainedWidth + 'px';
        container.style.height = constrainedHeight + 'px';
      });
    };

    const stopTouchResize = () => {
      isResizing = false;

      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }

      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      this.debouncedAutoSave();
    };

    document.addEventListener('touchmove', handleTouchResize, { passive: false });
    document.addEventListener('touchend', stopTouchResize);

    // Prevent default drag behavior
    container.addEventListener('dragstart', (e) => {
      e.preventDefault();
    });

    // Assemble the container
    container.appendChild(img);
    container.appendChild(dragHandle);
    container.appendChild(sizeControls);
    container.appendChild(resizeHandle);

    return container;
  }



  showImageModal(imageSrc, imageName) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay image-modal';

    modalOverlay.innerHTML = `
      <div class="modal image-viewer">
        <div class="image-modal-header">
          <h3 class="image-modal-title">${this.escapeHtml(imageName)}</h3>
          <button class="modal-close-btn" id="closeImageBtn">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="image-modal-content">
          <img src="${imageSrc}" alt="${this.escapeHtml(imageName)}" class="modal-image">
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Handle close
    const closeBtn = document.getElementById('closeImageBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    closeBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Initialize lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  updateToolbarState() {
    const editor = document.getElementById('noteContentEditor');
    if (!editor || document.activeElement !== editor) return;

    const commands = {
      'boldBtn': 'bold',
      'italicBtn': 'italic',
      'underlineBtn': 'underline',
      'strikeBtn': 'strikeThrough',
      'bulletListBtn': 'insertUnorderedList',
      'numberListBtn': 'insertOrderedList',
      'alignLeftBtn': 'justifyLeft',
      'alignCenterBtn': 'justifyCenter',
      'alignRightBtn': 'justifyRight'
    };

    // Update button states safely
    Object.entries(commands).forEach(([btnId, command]) => {
      const btn = document.getElementById(btnId);
      if (btn) {
        try {
          if (document.queryCommandState && document.queryCommandState(command)) {
            btn.classList.add('active');
          } else {
            btn.classList.remove('active');
          }
        } catch (error) {
          // Silently handle errors for unsupported commands
          btn.classList.remove('active');
        }
      }
    });

    // Update undo/redo button states using our manual implementation
    this.updateUndoRedoState();

    // Update heading selector safely
    const headingSelect = document.getElementById('headingSelect');
    if (headingSelect) {
      try {
        const formatBlock = document.queryCommandValue ? document.queryCommandValue('formatBlock') : '';
        headingSelect.value = formatBlock || 'p';
      } catch (error) {
        headingSelect.value = 'p';
      }
    }
  }

  addClickAnimation(element) {
    element.style.transform = 'scale(0.95)';
    setTimeout(() => {
      element.style.transform = '';
    }, 150);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  debouncedAutoSave() {
    this.showAutoSaveIndicator('saving');

    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout);
    }

    this.autoSaveTimeout = setTimeout(() => {
      this.saveCurrentNote();
      this.showAutoSaveIndicator('saved');
    }, 1000);
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  hashPassword(password) {
    // Simple hash function for client-side password protection
    // Note: This is not cryptographically secure, just for basic protection
    let hash = 0;
    if (password.length === 0) return hash;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  createNewNotebook(type) {
    if (type === 'personal') {
      this.showPersonalNotebookPasswordModal();
    } else {
      this.showNotebookTitleModal(type);
    }
  }

  showPersonalNotebookPasswordModal() {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Create Personal Notebook</h2>
          <p class="modal-subtitle">Set a password to protect your personal notebook</p>
        </div>
        <form class="modal-form" id="personalNotebookForm">
          <div class="form-group">
            <label class="form-label" for="personalNotebookTitle">Notebook Title*</label>
            <input 
              type="text" 
              id="personalNotebookTitle" 
              class="form-input" 
              placeholder="Enter notebook title"
              required
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="personalNotebookPassword">Password*</label>
            <input 
              type="password" 
              id="personalNotebookPassword" 
              class="form-input" 
              placeholder="Enter password for this notebook"
              required
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="personalNotebookPasswordConfirm">Confirm Password*</label>
            <input 
              type="password" 
              id="personalNotebookPasswordConfirm" 
              class="form-input" 
              placeholder="Confirm your password"
              required
              autocomplete="off"
            >
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="cancelPersonalBtn">Cancel</button>
            <button type="submit" class="modal-btn modal-btn-primary" id="createPersonalBtn">Create Personal Notebook</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Focus on input
    setTimeout(() => {
      const input = document.getElementById('personalNotebookTitle');
      if (input) input.focus();
    }, 300);

    // Handle form submission
    const form = document.getElementById('personalNotebookForm');
    const titleInput = document.getElementById('personalNotebookTitle');
    const passwordInput = document.getElementById('personalNotebookPassword');
    const confirmPasswordInput = document.getElementById('personalNotebookPasswordConfirm');
    const cancelBtn = document.getElementById('cancelPersonalBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    const createPersonalNotebook = () => {
      const title = titleInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!title) {
        titleInput.focus();
        return;
      }

      if (!password) {
        passwordInput.focus();
        alert('Please enter a password for your personal notebook.');
        return;
      }

      if (password !== confirmPassword) {
        confirmPasswordInput.focus();
        alert('Passwords do not match. Please try again.');
        return;
      }

      if (password.length < 4) {
        passwordInput.focus();
        alert('Password must be at least 4 characters long.');
        return;
      }

      // Hash the password for storage
      const hashedPassword = this.hashPassword(password);

      const newNotebook = {
        id: this.generateId(),
        title: title,
        type: 'personal',
        password: hashedPassword,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.notebooks.unshift(newNotebook);
      this.saveNotebooks();
      this.renderNotesList();
      this.showNotebookView(newNotebook.id);
      this.updateDeskView();

      closeModal();
    };

    // Event listeners
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      createPersonalNotebook();
    });

    cancelBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  showNotebookTitleModal(type) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Create New Notebook</h2>
          <p class="modal-subtitle">Enter a title for your ${type} notebook</p>
        </div>
        <form class="modal-form" id="notebookTitleForm">
          <div class="form-group">
            <label class="form-label" for="notebookTitleInput">Notebook Title*</label>
            <input 
              type="text" 
              id="notebookTitleInput" 
              class="form-input" 
              placeholder="Enter notebook title"
              required
              autocomplete="off"
            >
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="cancelBtn">Cancel</button>
            <button type="submit" class="modal-btn modal-btn-primary" id="createBtn">Create Notebook</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Focus on input
    setTimeout(() => {
      const input = document.getElementById('notebookTitleInput');
      if (input) input.focus();
    }, 300);

    // Handle form submission
    const form = document.getElementById('notebookTitleForm');
    const input = document.getElementById('notebookTitleInput');
    const cancelBtn = document.getElementById('cancelBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    const createNotebook = () => {
      const title = input.value.trim();
      if (!title) {
        input.focus();
        return;
      }

      const newNotebook = {
        id: this.generateId(),
        title: title,
        type: type,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.notebooks.unshift(newNotebook);
      this.saveNotebooks();
      this.renderNotesList();
      this.showNotebookView(newNotebook.id);
      this.updateDeskView();

      closeModal();
    };

    // Event listeners
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      createNotebook();
    });

    cancelBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  showPasswordVerificationModal(notebook) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Enter Password</h2>
          <p class="modal-subtitle">This personal notebook is password protected</p>
        </div>
        <form class="modal-form" id="passwordVerificationForm">
          <div class="form-group">
            <label class="form-label" for="notebookPasswordInput">Password for &quot;${this.escapeHtml(notebook.title)}&quot;</label>
            <input 
              type="password" 
              id="notebookPasswordInput" 
              class="form-input" 
              placeholder="Enter your password"
              required
              autocomplete="off"
            >
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="cancelPasswordBtn">Cancel</button>
            <button type="submit" class="modal-btn modal-btn-primary" id="verifyPasswordBtn">Open Notebook</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Focus on password input
    setTimeout(() => {
      const input = document.getElementById('notebookPasswordInput');
      if (input) input.focus();
    }, 300);

    // Handle form submission
    const form = document.getElementById('passwordVerificationForm');
    const passwordInput = document.getElementById('notebookPasswordInput');
    const cancelBtn = document.getElementById('cancelPasswordBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    const verifyPassword = () => {
      const enteredPassword = passwordInput.value;

      if (!enteredPassword) {
        passwordInput.focus();
        return;
      }

      const hashedEnteredPassword = this.hashPassword(enteredPassword);

      if (hashedEnteredPassword === notebook.password) {
        closeModal();
        setTimeout(() => {
          this.openNotebookAfterVerification(notebook.id);
        }, 300);
      } else {
        passwordInput.value = '';
        passwordInput.focus();
        alert('Incorrect password. Please try again.');
      }
    };

    // Event listeners
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      verifyPassword();
    });

    cancelBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  showPersonalNotebookDeleteModal(notebook) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Delete Personal Notebook</h2>
          <p class="modal-subtitle">Enter your password to confirm deletion of &quot;${this.escapeHtml(notebook.title)}&quot;</p>
        </div>
        <form class="modal-form" id="deletePersonalNotebookForm">
          <div class="form-group">
            <label class="form-label" for="deleteNotebookPasswordInput">Password for &quot;${this.escapeHtml(notebook.title)}&quot;</label>
            <input 
              type="password" 
              id="deleteNotebookPasswordInput" 
              class="form-input" 
              placeholder="Enter your password to confirm deletion"
              required
              autocomplete="off"
            >
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="cancelDeleteBtn">Cancel</button>
            <button type="submit" class="modal-btn modal-btn-danger" id="confirmDeleteBtn" style="background-color: var(--color-error); border-color: var(--color-error);">Delete Notebook</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Focus on password input
    setTimeout(() => {
      const input = document.getElementById('deleteNotebookPasswordInput');
      if (input) input.focus();
    }, 300);

    // Handle form submission
    const form = document.getElementById('deletePersonalNotebookForm');
    const passwordInput = document.getElementById('deleteNotebookPasswordInput');
    const cancelBtn = document.getElementById('cancelDeleteBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    const confirmDelete = () => {
      const enteredPassword = passwordInput.value;

      if (!enteredPassword) {
        passwordInput.focus();
        return;
      }

      const hashedEnteredPassword = this.hashPassword(enteredPassword);

      if (hashedEnteredPassword === notebook.password) {
        closeModal();
        setTimeout(() => {
            this.showCustomConfirmDialog(
              'Delete Notebook',
              `Are you sure you want to delete "${notebook.title}" and all its notes? This action cannot be undone.`,
              () => {
                this.deleteNotebook(notebook.id);
              }
            );
        }, 300);
      } else {
        passwordInput.value = '';
        passwordInput.focus();
        alert('Incorrect password. Please try again.');
      }
    };

    // Event listeners
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      confirmDelete();
    });

    cancelBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  openNotebookAfterVerification(notebookId) {
    this.currentNotebookId = notebookId;
    this.currentNoteId = null;

    const dashboard = document.getElementById('dashboardContainer');
    const notebookView = document.getElementById('notebookViewContainer');

    dashboard.style.transform = 'translateX(-100%)';
    dashboard.style.opacity = '0';

    setTimeout(() => {
      dashboard.style.display = 'none';
      dashboard.style.transform = '';
      dashboard.style.opacity = '';

      notebookView.style.display = 'flex';
      notebookView.classList.add('slide-in-right');

      const notebook = this.notebooks.find(n => n.id === notebookId);
      this.typewriterEffect(document.getElementById('notebookTitle'), notebook.title);

      // Load notes for this notebook
      const notebookNotes = this.notes.filter(note => note.notebookId === notebookId);
      const notebookContent = document.getElementById('notebookContent');

      if (notebookNotes.length === 0) {
        notebookContent.innerHTML = '<p><em>This notebook is empty. Click "New Note" to add the first page.</em></p>';
      } else {
        const notesHtml = notebookNotes.map(note => `
          <div class="notebook-note-item" data-note-id="${note.id}">
            <h3>${this.escapeHtml(note.title || 'Untitled Note')}</h3>
            <p>${this.escapeHtml(note.content.substring(0, 200) + (note.content.length > 200 ? '...' : ''))}</p>
            <div class="note-actions">
              <button class="view-note-btn" data-note-id="${note.id}">View</button>
              <button class="edit-note-btn" data-note-id="${note.id}">Edit</button>
              <button class="delete-note-btn" data-note-id="${note.id}">Delete</button>
            </div>
          </div>
        `).join('');
        notebookContent.innerHTML = notesHtml;

        // Add event listeners to note items
        notebookContent.querySelectorAll('.view-note-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const noteId = e.target.dataset.noteId;
            this.showNotePreviewModal(noteId);
          });
        });

        notebookContent.querySelectorAll('.edit-note-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const noteId = e.target.dataset.noteId;
            this.loadNote(noteId);
          });
        });

        notebookContent.querySelectorAll('.delete-note-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const noteId = e.target.dataset.noteId;
            const note = this.notes.find(n => n.id === noteId);
            const noteTitle = note ? (note.title || 'Untitled Note') : 'this note';

            this.showCustomConfirmDialog(
              'Delete Note',
              `Are you sure you want to delete "${noteTitle}"?`,
              () => {
                this.deleteNote(noteId);
                this.showNotebookView(notebookId); // Refresh notebook view
              }
            );
          });
        });

        // Re-initialize icons for notebook content
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }

      // Update metadata
      setTimeout(() => {
        const createdDate = new Date(notebook.createdAt);
        const now = new Date();
        const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
        const daysText = daysDiff === 0 ? 'Today' : daysDiff === 1 ? '1 day ago' : `${daysDiff} days ago`;

        const notebookNotes = this.notes.filter(note => note.notebookId === notebookId);
        document.getElementById('notebookCreatedDate').textContent = daysText;
        document.getElementById('notebookStatus').textContent = 'Unpublished';
        document.getElementById('notebookSections').textContent = Math.ceil(notebookNotes.length / 3).toString();
        document.getElementById('notebookPages').textContent = notebookNotes.length.toString();
        document.getElementById('notebookBookmarks').textContent = '0';

        document.querySelectorAll('.metadata-item').forEach((item, index) => {
          item.style.opacity = '0';
          item.style.transform = 'translateY(10px)';
          setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
          }, index * 100);
        });
      }, 300);

      this.updateActiveNotebook(notebookId);
    }, 200);
  }

  showEditNotebookModal(notebook) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Edit Notebook</h2>
          <p class="modal-subtitle">Update the title for your notebook</p>
        </div>
        <form class="modal-form" id="editNotebookForm">
          <div class="form-group">
            <label class="form-label" for="editNotebookTitleInput">Notebook Title*</label>
            <input 
              type="text" 
              id="editNotebookTitleInput" 
              class="form-input" 
              placeholder="Enter notebook title"
              value="${this.escapeHtml(notebook.title)}"
              required
              autocomplete="off"
            >
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="cancelEditBtn">Cancel</button>
            <button type="submit" class="modal-btn modal-btn-primary" id="updateBtn">Update Notebook</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Focus on input and select text
    setTimeout(() => {
      const input = document.getElementById('editNotebookTitleInput');
      if (input) {
        input.focus();
        input.select();
      }
    }, 300);

    // Handle form submission
    const form = document.getElementById('editNotebookForm');
    const input = document.getElementById('editNotebookTitleInput');
    const cancelBtn = document.getElementById('cancelEditBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    const updateNotebook = () => {
      const title = input.value.trim();
      if (!title) {
        input.focus();
        return;
      }

      notebook.title = title;
      notebook.updatedAt = new Date().toISOString();
      this.saveNotebooks();
      this.renderNotesList();
      this.updateDeskView();

      closeModal();
    };

    // Event listeners
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      updateNotebook();
    });

    cancelBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  createNewNote() {
    if (this.currentNotebookId) {
      // Create note inside current notebook
      this.createNoteInNotebook(this.currentNotebookId);
    } else {
      // Create standalone note (legacy behavior)
      const newNote = {
        id: this.generateId(),
        title: '',
        content: '',
        notebookId: null,
        type: 'blank',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      this.notes.unshift(newNote);
      this.saveNotes();
      this.renderNotesList();
      this.loadNote(newNote.id);
      this.updateDeskView();
    }
  }

  createNoteInNotebook(notebookId) {
    const newNote = {
      id: this.generateId(),
      title: '',
      content: '',
      notebookId: notebookId,
      type: 'blank',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.notes.unshift(newNote);
    this.saveNotes();
    this.renderNotesList();
    this.loadNote(newNote.id);
    this.updateDeskView();
  }

  showNotePreviewModal(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    const formattedDate = new Date(note.updatedAt).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay note-preview-modal';

    modalOverlay.innerHTML = `
      <div class="modal note-preview">
        <div class="note-preview-header">
          <div class="note-preview-meta">
            <h2 class="note-preview-title">${this.escapeHtml(note.title || 'Untitled Note')}</h2>
            <p class="note-preview-date">Last modified: ${formattedDate}</p>
          </div>
          <button class="modal-close-btn" id="closePreviewBtn">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="note-preview-content">
          <div class="note-preview-text">${this.formatNoteContent(note.content)}</div>
        </div>
        <div class="note-preview-actions">
          <button class="modal-btn modal-btn-secondary" id="closeNoteBtn">Close</button>
          <button class="modal-btn modal-btn-primary" id="editNoteBtn">
            <i data-lucide="edit-3"></i>
            Edit Note
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Handle actions
    const closeBtn = document.getElementById('closePreviewBtn');
    const closeNoteBtn = document.getElementById('closeNoteBtn');
    const editBtn = document.getElementById('editNoteBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    const editNote = () => {
      closeModal();
      setTimeout(() => {
        this.loadNote(noteId);
      }, 300);
    };

    // Event listeners
    closeBtn.addEventListener('click', closeModal);
    closeNoteBtn.addEventListener('click', closeModal);
    editBtn.addEventListener('click', editNote);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Initialize lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  formatNoteContent(content) {
    if (!content || content.trim() === '') {
      return '<p class="empty-note-content"><em>This note is empty</em></p>';
    }

    // If content appears to be HTML (contains tags), return as-is
    if (content.includes('<') && content.includes('>')) {
      return content;
    }

    // Convert plain text line breaks to paragraphs
    const paragraphs = content.split('\n').filter(p => p.trim() !== '');
    if (paragraphs.length === 0) {
      return '<p class="empty-note-content"><em>This note is empty</em></p>';
    }

    return paragraphs.map(p => `<p>${this.escapeHtml(p)}</p>`).join('');
  }

  loadNote(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    this.currentNoteId = noteId;
    this.currentNotebookId = note.notebookId;

    const dashboard = document.getElementById('dashboardContainer');
    const editor = document.getElementById('editorContainer');
    const notebookView = document.getElementById('notebookViewContainer');

    // Hide current views
    [dashboard, notebookView].forEach(container => {
      if (container.style.display !== 'none') {
        container.style.transform = 'translateX(-100%)';
        container.style.opacity = '0';
        setTimeout(() => {
          container.style.display = 'none';
          container.style.transform = '';
          container.style.opacity = '';
        }, 200);
      }
    });

    setTimeout(() => {
      editor.style.display = 'flex';
      editor.classList.add('slide-in-right');

      document.getElementById('noteTitle').value = note.title;

      // Load content into rich text editor
      const noteContentEditor = document.getElementById('noteContentEditor');
      noteContentEditor.innerHTML = note.content || '';

      // Initialize editor history for the loaded note
      this.editorHistory = [];
      this.historyIndex = -1;
      
      // Save initial state
      setTimeout(() => {
        this.saveEditorState();
      }, 100);

      this.updateActiveNote(noteId);
      this.updateToolbarState();
      this.updateUndoRedoState();

      setTimeout(() => {
        document.getElementById('noteTitle').focus();
      }, 300);
    }, 200);
  }

  // Password Manager Methods
  generatePassword(length = 16, options = {}) {
    const {
      includeUppercase = true,
      includeLowercase = true,
      includeNumbers = true,
      includeSymbols = true,
      excludeSimilar = true
    } = options;

    let charset = '';
    if (includeLowercase) charset += excludeSimilar ? 'abcdefghjkmnpqrstuvwxyz' : 'abcdefghijklmnopqrstuvwxyz';
    if (includeUppercase) charset += excludeSimilar ? 'ABCDEFGHJKMNPQRSTUVWXYZ' : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (includeNumbers) charset += excludeSimilar ? '23456789' : '0123456789';
    if (includeSymbols) charset += '!@#$%^&*()_+-=[]{}|;:,.<>?';

    if (!charset) charset = 'abcdefghijklmnopqrstuvwxyz';

    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }

    return password;
  }

  calculatePasswordStrength(password) {
    let score = 0;
    let feedback = [];

    // Length check
    if (password.length >= 8) score += 25;
    else feedback.push('Use at least 8 characters');

    if (password.length >= 12) score += 25;

    // Character variety checks
    if (/[a-z]/.test(password)) score += 10;
    else feedback.push('Include lowercase letters');

    if (/[A-Z]/.test(password)) score += 10;
    else feedback.push('Include uppercase letters');

    if (/[0-9]/.test(password)) score += 10;
    else feedback.push('Include numbers');

    if (/[^a-zA-Z0-9]/.test(password)) score += 20;
    else feedback.push('Include special characters');

    // Penalty for common patterns
    if (/(.)\1{2,}/.test(password)) score -= 10;
    if (/123|abc|qwe/i.test(password)) score -= 15;

    score = Math.max(0, Math.min(100, score));

    let strength = 'weak';
    if (score >= 80) strength = 'strong';
    else if (score >= 60) strength = 'good';
    else if (score >= 40) strength = 'fair';

    return { score, strength, feedback };
  }

  addPassword(passwordData) {
    const newPassword = {
      id: this.generateId(),
      title: passwordData.title,
      url: passwordData.url || '',
      username: passwordData.username || '',
      email: passwordData.email || '',
      password: passwordData.password,
      notes: passwordData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.passwords.unshift(newPassword);
    this.savePasswords();
    this.updatePasswordStats();
    this.renderPasswordList();
    return newPassword;
  }

  updatePassword(passwordId, updates) {
    const passwordIndex = this.passwords.findIndex(p => p.id === passwordId);
    if (passwordIndex !== -1) {
      this.passwords[passwordIndex] = {
        ...this.passwords[passwordIndex],
        ...updates,
        updatedAt: new Date().toISOString()
      };
      this.savePasswords();
      this.updatePasswordStats();
      this.renderPasswordList();
    }
  }

  deletePassword(passwordId) {
    this.passwords = this.passwords.filter(p => p.id !== passwordId);
    this.savePasswords();
    this.updatePasswordStats();
    this.renderPasswordList();
  }

  filterPasswords(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      this.filteredPasswords = [...this.passwords];
    } else {
      this.filteredPasswords = this.passwords.filter(password => 
        password.title.toLowerCase().includes(term) ||
        password.url.toLowerCase().includes(term) ||
        password.username.toLowerCase().includes(term) ||
        password.email.toLowerCase().includes(term)
      );
    }
    this.renderPasswordList();
  }

  copyToClipboard(text, type = 'text') {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.showCopyFeedback(type);
      }).catch(() => {
        this.fallbackCopyToClipboard(text, type);
      });
    } else {
      this.fallbackCopyToClipboard(text, type);
    }
  }

  fallbackCopyToClipboard(text, type) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      this.showCopyFeedback(type);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
    
    document.body.removeChild(textArea);
  }

  showCopyFeedback(type) {
    const feedback = document.createElement('div');
    feedback.className = 'copy-feedback';
    feedback.textContent = `${type} copied to clipboard!`;
    feedback.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--color-success);
      color: white;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      z-index: 10000;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
      animation: fadeInOut 2s ease-in-out;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        20%, 80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(feedback);

    setTimeout(() => {
      document.body.removeChild(feedback);
      document.head.removeChild(style);
    }, 2000);
  }

  updatePasswordStats() {
    const totalCount = this.passwords.length;
    let weakCount = 0;
    let duplicateCount = 0;
    const passwordFrequency = {};

    this.passwords.forEach(p => {
      // Count weak passwords
      const strength = this.calculatePasswordStrength(p.password);
      if (strength.strength === 'weak' || strength.strength === 'fair') {
        weakCount++;
      }

      // Count duplicates
      passwordFrequency[p.password] = (passwordFrequency[p.password] || 0) + 1;
    });

    Object.values(passwordFrequency).forEach(count => {
      if (count > 1) duplicateCount += count;
    });

    document.getElementById('totalPasswordsCount').textContent = totalCount;
    document.getElementById('weakPasswordsCount').textContent = weakCount;
    document.getElementById('duplicatePasswordsCount').textContent = duplicateCount;
  }

  savePasswords() {
    try {
      localStorage.setItem('passwords', JSON.stringify(this.passwords));
    } catch (error) {
      console.error('Failed to save passwords to localStorage:', error);
    }
  }

  showDashboard() {
    const dashboard = document.getElementById('dashboardContainer');
    const editor = document.getElementById('editorContainer');
    const notebookView = document.getElementById('notebookViewContainer');
    const passwordManagerView = document.getElementById('passwordManagerViewContainer');

    if (this.transitionTimeout) {
      clearTimeout(this.transitionTimeout);
    }

    [editor, notebookView, passwordManagerView].forEach(container => {
      if (container.style.display !== 'none') {
        container.style.transform = 'translateX(100%)';
        container.style.opacity = '0';

        this.transitionTimeout = setTimeout(() => {
          container.style.display = 'none';
          container.style.transform = '';
          container.style.opacity = '';
          container.classList.remove('slide-in-right', 'slide-in-left');
        }, 200);
      }
    });

    this.transitionTimeout = setTimeout(() => {
      dashboard.style.display = 'block';
      dashboard.classList.add('slide-in-left');
      this.currentNoteId = null;
      this.currentNotebookId = null;

      document.querySelectorAll('.note-item, .notebook-item').forEach(item => {
        item.classList.remove('active');
      });
    }, 200);
  }

  showNotebookView(notebookId) {
    const notebook = this.notebooks.find(n => n.id === notebookId);
    if (!notebook) return;

    // Check if it's a personal notebook that requires password
    if (notebook.type === 'personal' && notebook.password) {
      this.showPasswordVerificationModal(notebook);
      return;
    }

    this.currentNotebookId = notebookId;
    this.currentNoteId = null;

    const dashboard = document.getElementById('dashboardContainer');
    const notebookView = document.getElementById('notebookViewContainer');

    dashboard.style.transform = 'translateX(-100%)';
    dashboard.style.opacity = '0';

    setTimeout(() => {
      dashboard.style.display = 'none';
      dashboard.style.transform = '';
      dashboard.style.opacity = '';

      notebookView.style.display = 'flex';
      notebookView.classList.add('slide-in-right');

      this.typewriterEffect(document.getElementById('notebookTitle'), notebook.title);

      // Load notes for this notebook
      const notebookNotes = this.notes.filter(note => note.notebookId === notebookId);
      const notebookContent = document.getElementById('notebookContent');

      if (notebookNotes.length === 0) {
        notebookContent.innerHTML = '<p><em>This notebook is empty. Click "New Note" to add the first page.</em></p>';
      } else {
        const notesHtml = notebookNotes.map(note => `
          <div class="notebook-note-item" data-note-id="${note.id}">
            <h3>${this.escapeHtml(note.title || 'Untitled Note')}</h3>
            <p>${this.escapeHtml(note.content.substring(0, 200) + (note.content.length > 200 ? '...' : ''))}</p>
            <div class="note-actions">
              <button class="view-note-btn" data-note-id="${note.id}">View</button>
              <button class="edit-note-btn" data-note-id="${note.id}">Edit</button>
              <button class="delete-note-btn" data-note-id="${note.id}">Delete</button>
            </div>
          </div>
        `).join('');
        notebookContent.innerHTML = notesHtml;

        // Add event listeners to note items
        notebookContent.querySelectorAll('.view-note-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const noteId = e.target.dataset.noteId;
            this.showNotePreviewModal(noteId);
          });
        });

        notebookContent.querySelectorAll('.edit-note-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const noteId = e.target.dataset.noteId;
            this.loadNote(noteId);
          });
        });

        notebookContent.querySelectorAll('.delete-note-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            const noteId = e.target.dataset.noteId;
            const note = this.notes.find(n => n.id === noteId);
            const noteTitle = note ? (note.title || 'Untitled Note') : 'this note';

            this.showCustomConfirmDialog(
              'Delete Note',
              `Are you sure you want to delete "${noteTitle}"?`,
              () => {
                this.deleteNote(noteId);
                this.showNotebookView(notebookId); // Refresh notebook view
              }
            );
          });
        });

        // Re-initialize icons for notebook content
        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      }

      // Update metadata
      setTimeout(() => {
        const createdDate = new Date(notebook.createdAt);
        const now = new Date();
        const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
        const daysText = daysDiff === 0 ? 'Today' : daysDiff === 1 ? '1 day ago' : `${daysDiff} days ago`;

        const notebookNotes = this.notes.filter(note => note.notebookId === notebookId);
        document.getElementById('notebookCreatedDate').textContent = daysText;
        document.getElementById('notebookStatus').textContent = 'Unpublished';
        document.getElementById('notebookSections').textContent = Math.ceil(notebookNotes.length / 3).toString();
        document.getElementById('notebookPages').textContent = notebookNotes.length.toString();
        document.getElementById('notebookBookmarks').textContent = '0';

        document.querySelectorAll('.metadata-item').forEach((item, index) => {
          item.style.opacity = '0';
          item.style.transform = 'translateY(10px)';
          setTimeout(() => {
            item.style.transition = 'all 0.3s ease';
            item.style.opacity = '1';
            item.style.transform = 'translateY(0)';
          }, index * 100);
        });
      }, 300);

      this.updateActiveNotebook(notebookId);
    }, 200);
  }

  typewriterEffect(element, text) {
    if (!element || !text) return;

    if (element.typewriterTimer) {
      clearInterval(element.typewriterTimer);
      element.typewriterTimer = null;
    }

    element.textContent = '';
    let i = 0;
    const timer = setInterval(() => {
      if (i < text.length) {
        element.textContent += text.charAt(i);
        i++;
      } else {
        clearInterval(timer);
        element.typewriterTimer = null;
      }
    }, 50);

    element.typewriterTimer = timer;
  }

  openNotebookForEditing() {
    if (!this.currentNotebookId) return;
    this.createNoteInNotebook(this.currentNotebookId);
  }

  saveCurrentNote() {
    if (!this.currentNoteId) return;

    const note = this.notes.find(n => n.id === this.currentNoteId);
    if (!note) return;

    const title = document.getElementById('noteTitle').value.trim() || 'Untitled Note';
    const contentEditor = document.getElementById('noteContentEditor');
    const content = contentEditor ? contentEditor.innerHTML : '';

    note.title = title;
    note.content = content;
    note.updatedAt = new Date().toISOString();

    this.saveNotes();
    this.updateSpecificNote(note);
    this.updateDeskView();
  }

  deleteNote(noteId) {
    const note = this.notes.find(n => n.id === noteId);
    if (!note) return;

    // Move note to trash
    const trashedItem = {
      id: noteId,
      type: 'note',
      originalData: { ...note },
      deletedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };

    this.trashedItems.unshift(trashedItem);
    this.notes = this.notes.filter(n => n.id !== noteId);

    this.saveNotes();
    this.saveTrashedItems();
    this.renderNotesList();
    this.renderTrashList();
    this.updateDeskView();

    if (this.currentNoteId === noteId) {
      this.showDashboard();
    }
  }

  deleteNotebook(notebookId) {
    const notebook = this.notebooks.find(n => n.id === notebookId);
    if (!notebook) return;

    // Get all notes in the notebook
    const notebookNotes = this.notes.filter(n => n.notebookId === notebookId);

    // Move notebook to trash
    const trashedItem = {
      id: notebookId,
      type: 'notebook',
      originalData: { 
        notebook: { ...notebook },
        notes: [...notebookNotes]
      },
      deletedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };

    this.trashedItems.unshift(trashedItem);

    // Remove notebook and its notes from active lists
    this.notes = this.notes.filter(n => n.notebookId !== notebookId);
    this.notebooks = this.notebooks.filter(n => n.id !== notebookId);

    this.saveNotes();
    this.saveNotebooks();
    this.saveTrashedItems();
    this.renderNotesList();
    this.renderTrashList();
    this.updateDeskView();

    if (this.currentNotebookId === notebookId) {
      this.showDashboard();
    }
  }

  updateDeskView() {
    const deskContent = document.getElementById('deskContent');
    const emptyMessage = document.getElementById('emptyDeskMessage');
    const deskNavButtons = document.getElementById('deskNavButtons');

    if (this.notebooks.length === 0) {
      emptyMessage.style.display = 'block';
      deskNavButtons.classList.remove('show');
      // Hide the static cards when empty
      const deskCards = document.getElementById('deskCards');
      if (deskCards) {
        deskCards.style.display = 'none';
        deskCards.style.transform = 'translateX(0)';
      }
      // Reset navigation index
      this.deskCurrentIndex = 0;
    } else {
      emptyMessage.style.display = 'none';

      // Create dynamic desk cards from notebooks only
      const deskCardsContainer = document.getElementById('deskCards');
      if (deskCardsContainer) {
        deskCardsContainer.innerHTML = '';

        // Reset scroll position when content changes
        this.deskCurrentIndex = 0;
        deskCardsContainer.style.transform = 'translateX(0)';

        // Determine layout based on number of notebooks
        if (this.notebooks.length > 3) {
          deskCardsContainer.classList.remove('grid-layout');
        } else {
          deskCardsContainer.classList.add('grid-layout');
        }

        deskCardsContainer.style.display = 'flex';

        // Add notebooks only
        this.notebooks.forEach(notebook => {
          const notebookNotes = this.notes.filter(note => note.notebookId === notebook.id);
          const noteCount = notebookNotes.length;

          const formattedDate = new Date(notebook.updatedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });

          const deskCard = document.createElement('div');
          deskCard.className = 'desk-card';
          deskCard.innerHTML = `
            <div class="desk-card-content">
              <h3 class="desk-card-title">${this.escapeHtml(notebook.title)}</h3>
              <p class="desk-card-description">${noteCount} note${noteCount !== 1 ? 's' : ''} • Notebook</p>
              <div class="desk-card-meta">Updated ${formattedDate}</div>
            </div>
          `;

          deskCard.addEventListener('click', () => {
            this.showNotebookView(notebook.id);
          });

          deskCardsContainer.appendChild(deskCard);
        });

        // Update navigation buttons state after DOM is ready
        setTimeout(() => {
          this.updateDeskNavigation();
        }, 10);
      }
    }

    // Re-initialize Lucide icons after DOM updates
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  renderNotesList() {
    const notesList = document.getElementById('notesList');
    notesList.innerHTML = '';

    // Remove any existing event listeners to prevent duplicates
    const oldNotesList = notesList.cloneNode(false);
    notesList.parentNode.replaceChild(oldNotesList, notesList);

    // Render notebooks first
    this.notebooks.forEach((notebook) => {
      const notebookElement = this.createNotebookElement(notebook);
      oldNotesList.appendChild(notebookElement);
    });

    // Render standalone notes (notes without notebookId)
    const standaloneNotes = this.notes.filter(note => !note.notebookId);
    standaloneNotes.forEach((note) => {
      const noteElement = this.createNoteElement(note);
      oldNotesList.appendChild(noteElement);
    });

    // Re-initialize Lucide icons after DOM updates
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  createNotebookElement(notebook) {
    const notebookDiv = document.createElement('div');
    notebookDiv.className = 'notebook-item';
    notebookDiv.dataset.notebookId = notebook.id;

    const notebookNotes = this.notes.filter(note => note.notebookId === notebook.id);
    const noteCount = notebookNotes.length;

    const formattedDate = new Date(notebook.updatedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const iconName = notebook.type === 'personal' && notebook.password ? 'lock' : 'notebook';
    const typeLabel = notebook.type === 'personal' && notebook.password ? 'Protected' : '';

    notebookDiv.innerHTML = `
      <div class="notebook-icon">
        <i data-lucide="${iconName}"></i>
      </div>
      <div class="notebook-details">
        <div class="notebook-item-title">${this.escapeHtml(notebook.title)} ${typeLabel ? `<span class="notebook-type-label">${typeLabel}</span>` : ''}</div>
        <div class="notebook-item-preview">${noteCount} note${noteCount !== 1 ? 's' : ''}</div>
        <div class="notebook-item-date">${formattedDate}</div>
      </div>
      <div class="notebook-actions">
        <button class="edit-btn" data-notebook-id="${notebook.id}">
          <i data-lucide="edit-2"></i>
        </button>
        <button class="delete-btn" data-notebook-id="${notebook.id}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    // Add click handler for notebook
    notebookDiv.addEventListener('click', (e) => {
      if (e.target.closest('.notebook-actions')) return;

      this.addClickAnimation(notebookDiv);

      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      }

      setTimeout(() => {
        this.showNotebookView(notebook.id);
      }, 150);
    });

    // Add edit button handler
    const editBtn = notebookDiv.querySelector('.edit-btn');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showEditNotebookModal(notebook);
    });

    // Add delete button handler
    const deleteBtn = notebookDiv.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (notebook.type === 'personal' && notebook.password) {
        this.showPersonalNotebookDeleteModal(notebook);
      } else {
        this.showCustomConfirmDialog(
          'Delete Notebook',
          `Are you sure you want to delete "${notebook.title}" and all its notes?`,
          () => {
            this.deleteNotebook(notebook.id);
          }
        );
      }
    });

    notebookDiv.style.opacity = '0';
    notebookDiv.style.transform = 'translateY(20px)';

    setTimeout(() => {
      notebookDiv.style.transition = 'all 0.3s ease';
      notebookDiv.style.opacity = '1';
      notebookDiv.style.transform = 'translateY(0)';
    }, 50);

    return notebookDiv;
  }

  createNoteElement(note) {
    const noteDiv = document.createElement('div');
    noteDiv.className = 'note-item';
    noteDiv.dataset.noteId = note.id;

    // Extract plain text from HTML content for preview
    const textContent = this.stripHtmlTags(note.content);
    const preview = textContent.length > 100 
      ? textContent.substring(0, 100) + '...' 
      : textContent || 'No content';

    const formattedDate = new Date(note.updatedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    noteDiv.innerHTML = `
      <div class="note-content">
        <div class="note-item-title">${this.escapeHtml(note.title || 'Untitled Note')}</div>
        <div class="note-item-preview">${this.escapeHtml(preview)}</div>
        <div class="note-item-date">${formattedDate}</div>
      </div>
      <div class="note-actions">
        <button class="delete-btn" data-note-id="${note.id}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    // Add click handler for note content area
    const noteContent = noteDiv.querySelector('.note-content');
    const clickHandler = (e) => {
      this.addClickAnimation(noteDiv);

      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      }

      setTimeout(() => {
        this.showNotePreviewModal(note.id);
      }, 150);
    };

    noteContent.addEventListener('click', clickHandler);
    // Store the handler for potential cleanup
    noteDiv._clickHandler = clickHandler;

    // Add delete button handler
    const deleteBtn = noteDiv.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showCustomConfirmDialog(
        'Delete Note',
        `Are you sure you want to delete "${note.title || 'Untitled Note'}"?`,
        () => {
          this.deleteNote(note.id);
        }
      );
    });

    noteDiv.style.opacity = '0';
    noteDiv.style.transform = 'translateY(20px)';

    setTimeout(() => {
      noteDiv.style.transition = 'all 0.3s ease';
      noteDiv.style.opacity = '1';
      noteDiv.style.transform = 'translateY(0)';
    }, 50);

    return noteDiv;
  }

  stripHtmlTags(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  saveEditorState() {
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;

    const currentContent = editor.innerHTML;
    
    // Don't save duplicate states
    if (this.editorHistory.length > 0 && 
        this.historyIndex >= 0 && 
        this.editorHistory[this.historyIndex] && 
        this.editorHistory[this.historyIndex].content === currentContent) {
      return;
    }

    const state = {
      content: currentContent,
      timestamp: Date.now(),
      selection: this.saveSelection()
    };

    // Remove future history if we're not at the end
    if (this.historyIndex < this.editorHistory.length - 1) {
      this.editorHistory = this.editorHistory.slice(0, this.historyIndex + 1);
    }

    // Add new state
    this.editorHistory.push(state);
    this.historyIndex++;

    // Limit history size
    if (this.editorHistory.length > this.maxHistorySize) {
      this.editorHistory.shift();
      this.historyIndex--;
    }

    // Update toolbar state
    this.updateUndoRedoState();
  }

  saveSelection() {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    const editor = document.getElementById('noteContentEditor');
    if (!editor || !editor.contains(range.commonAncestorContainer)) return null;
    
    return {
      startOffset: range.startOffset,
      endOffset: range.endOffset,
      startContainer: this.getNodePath(range.startContainer, editor),
      endContainer: this.getNodePath(range.endContainer, editor)
    };
  }

  restoreSelection(selectionData) {
    if (!selectionData) return;
    
    const editor = document.getElementById('noteContentEditor');
    if (!editor) return;
    
    try {
      const startNode = this.getNodeByPath(selectionData.startContainer, editor);
      const endNode = this.getNodeByPath(selectionData.endContainer, editor);
      
      if (startNode && endNode) {
        const range = document.createRange();
        range.setStart(startNode, Math.min(selectionData.startOffset, startNode.textContent?.length || 0));
        range.setEnd(endNode, Math.min(selectionData.endOffset, endNode.textContent?.length || 0));
        
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } catch (error) {
      // Silently handle selection restoration errors
    }
  }

  getNodePath(node, root) {
    const path = [];
    while (node && node !== root) {
      const parent = node.parentNode;
      if (parent) {
        const index = Array.from(parent.childNodes).indexOf(node);
        path.unshift(index);
      }
      node = parent;
    }
    return path;
  }

  getNodeByPath(path, root) {
    let node = root;
    for (const index of path) {
      if (node.childNodes[index]) {
        node = node.childNodes[index];
      } else {
        return null;
      }
    }
    return node;
  }

  performUndo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      const state = this.editorHistory[this.historyIndex];
      const editor = document.getElementById('noteContentEditor');
      if (editor && state) {
        // Temporarily disable input events to prevent saving during undo
        this.isUndoRedoAction = true;
        
        editor.innerHTML = state.content;
        
        // Focus the editor
        editor.focus();
        
        // Restore selection if available
        if (state.selection) {
          setTimeout(() => {
            this.restoreSelection(state.selection);
          }, 10);
        }
        
        // Re-initialize any image event listeners
        this.reinitializeImageEventListeners();
        
        // Update button states
        this.updateUndoRedoState();
        
        // Re-enable input events
        setTimeout(() => {
          this.isUndoRedoAction = false;
        }, 50);
        
        // Trigger auto-save
        this.debouncedAutoSave();
        
        return true;
      }
    }
    return false;
  }

  performRedo() {
    if (this.historyIndex < this.editorHistory.length - 1) {
      this.historyIndex++;
      const state = this.editorHistory[this.historyIndex];
      const editor = document.getElementById('noteContentEditor');
      if (editor && state) {
        // Temporarily disable input events to prevent saving during redo
        this.isUndoRedoAction = true;
        
        editor.innerHTML = state.content;
        
        // Focus the editor
        editor.focus();
        
        // Restore selection if available
        if (state.selection) {
          setTimeout(() => {
            this.restoreSelection(state.selection);
          }, 10);
        }
        
        // Re-initialize any image event listeners
        this.reinitializeImageEventListeners();
        
        // Update button states
        this.updateUndoRedoState();
        
        // Re-enable input events
        setTimeout(() => {
          this.isUndoRedoAction = false;
        }, 50);
        
        // Trigger auto-save
        this.debouncedAutoSave();
        
        return true;
      }
    }
    return false;
  }

  updateUndoRedoState() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');

    if (undoBtn) {
      const canUndo = this.historyIndex > 0;
      undoBtn.disabled = !canUndo;
      undoBtn.style.opacity = canUndo ? '1' : '0.5';
    }

    if (redoBtn) {
      const canRedo = this.historyIndex < this.editorHistory.length - 1;
      redoBtn.disabled = !canRedo;
      redoBtn.style.opacity = canRedo ? '1' : '0.5';
    }
  }

  manualUndo() {
    return this.performUndo();
  }

  manualRedo() {
    return this.performRedo();
  }

  updateSpecificNote(note) {
    const noteElement = document.querySelector(`[data-note-id="${note.id}"]`);
    if (!noteElement) return;

    // Extract plain text from HTML content for preview
    const textContent = this.stripHtmlTags(note.content);
    const preview = textContent.length > 100 
      ? textContent.substring(0, 100) + '...' 
      : textContent || 'No content';

    const formattedDate = new Date(note.updatedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const wasActive = noteElement.classList.contains('active');

    // Remove existing event listener if it exists
    if (noteElement._clickHandler) {
      const noteContent = noteElement.querySelector('.note-content');
      if (noteContent) {
        noteContent.removeEventListener('click', noteElement._clickHandler);
      }
    }

    noteElement.innerHTML = `
      <div class="note-content">
        <div class="note-item-title">${this.escapeHtml(note.title || 'Untitled Note')}</div>
        <div class="note-item-preview">${this.escapeHtml(preview)}</div>
        <div class="note-item-date">${formattedDate}</div>
      </div>
      <div class="note-actions">
        <button class="delete-btn" data-note-id="${note.id}">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;

    if (wasActive) {
      noteElement.classList.add('active');
    }

    // Add new event listener to note content
    const noteContent = noteElement.querySelector('.note-content');
    const clickHandler = (e) => {
      this.addClickAnimation(noteElement);

      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        sidebar.classList.remove('open');
        overlay.classList.remove('show');
      }

      setTimeout(() => {
        this.showNotePreviewModal(note.id);
      }, 150);
    };

    noteContent.addEventListener('click', clickHandler);
    // Store the handler for potential cleanup
    noteElement._clickHandler = clickHandler;

    // Add delete button handler
    const deleteBtn = noteElement.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showCustomConfirmDialog(
        'Delete Note',
        `Are you sure you want to delete "${note.title || 'Untitled Note'}"?`,
        () => {
          this.deleteNote(note.id);
        }
      );
    });

    // Re-initialize Lucide icons after DOM updates
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  updateActiveNote(noteId) {
    document.querySelectorAll('.note-item, .notebook-item').forEach(item => {
      item.classList.remove('active');
    });

    const activeNote = document.querySelector(`[data-note-id="${noteId}"]`);
    if (activeNote){
      activeNote.classList.add('active');
    }
  }

  updateActiveNotebook(notebookId) {
    document.querySelectorAll('.note-item, .notebook-item').forEach(item => {
      item.classList.remove('active');
    });

    const activeNotebook = document.querySelector(`[data-notebook-id="${notebookId}"]`);
    if (activeNotebook) {
      activeNotebook.classList.add('active');
    }
  }

  saveNotes() {
    try {
      localStorage.setItem('notes', JSON.stringify(this.notes));
    } catch (error) {
      console.error('Failed to save notes to localStorage:', error);
      this.showAutoSaveIndicator('error');
    }
  }

  saveNotebooks() {
    try {
      localStorage.setItem('notebooks', JSON.stringify(this.notebooks));
    } catch (error) {
      console.error('Failed to save notebooks to localStorage:', error);
      this.showAutoSaveIndicator('error');
    }
  }

  saveTrashedItems() {
    try {
      localStorage.setItem('trashedItems', JSON.stringify(this.trashedItems));
    } catch (error) {
      console.error('Failed to save trashed items to localStorage:', error);
      this.showAutoSaveIndicator('error');
    }
  }

  toggleTrash() {
    const rightSidebar = document.getElementById('rightSidebar');
    const appContainer = document.querySelector('.app-container');

    this.isTrashOpen = !this.isTrashOpen;

    if (this.isTrashOpen) {
      rightSidebar.classList.add('open');
      appContainer.classList.add('trash-open');
      // Add click outside listener when trash opens
      this.trashOutsideClickHandler = this.handleTrashOutsideClick.bind(this);
      setTimeout(() => {
        document.addEventListener('click', this.trashOutsideClickHandler);
      }, 100);
    } else {
      rightSidebar.classList.remove('open');
      appContainer.classList.remove('trash-open');
      // Remove click outside listener when trash closes
      if (this.trashOutsideClickHandler) {
        document.removeEventListener('click', this.trashOutsideClickHandler);
        this.trashOutsideClickHandler = null;
      }
    }
  }

  handleTrashOutsideClick(event) {
    const rightSidebar = document.getElementById('rightSidebar');
    const trashToggleBtn = document.getElementById('trashToggleBtn');
    
    // Check if click is outside the trash sidebar and not on the toggle button
    if (this.isTrashOpen && 
        !rightSidebar.contains(event.target) && 
        !trashToggleBtn.contains(event.target)) {
      this.closeTrash();
    }
  }

  closeTrash() {
    if (this.isTrashOpen) {
      const rightSidebar = document.getElementById('rightSidebar');
      const appContainer = document.querySelector('.app-container');
      
      this.isTrashOpen = false;
      rightSidebar.classList.remove('open');
      appContainer.classList.remove('trash-open');
      
      // Remove click outside listener
      if (this.trashOutsideClickHandler) {
        document.removeEventListener('click', this.trashOutsideClickHandler);
        this.trashOutsideClickHandler = null;
      }
    }
  }

  renderTrashList() {
    const trashList = document.getElementById('trashList');
    const emptyMessage = document.getElementById('emptyTrashMessage');
    const emptyTrashBtn = document.getElementById('emptyTrashBtn');

    if (!trashList) return;

    // Always clear all existing trash items first
    const existingItems = trashList.querySelectorAll('.trash-item');
    existingItems.forEach(item => item.remove());

    if (this.trashedItems.length === 0) {
      emptyMessage.style.display = 'flex';
      emptyTrashBtn.disabled = true;
      // Re-initialize icons for empty state
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
      return;
    }

    emptyMessage.style.display = 'none';
    emptyTrashBtn.disabled = false;

    this.trashedItems.forEach((trashedItem, index) => {
      const trashElement = this.createTrashElement(trashedItem);
      trashElement.style.animationDelay = `${index * 0.05}s`;
      trashList.appendChild(trashElement);
    });

    // Re-initialize Lucide icons after DOM updates
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  createTrashElement(trashedItem) {
    const trashDiv = document.createElement('div');
    trashDiv.className = 'trash-item';
    trashDiv.dataset.trashedId = trashedItem.id;

    const deletedDate = new Date(trashedItem.deletedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    const expiryDate = new Date(trashedItem.expiresAt);
    const now = new Date();
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    const expiryText = daysLeft <= 0 ? 'Expired' : `${daysLeft} days left`;

    let title, preview;
    if (trashedItem.type === 'notebook') {
      title = trashedItem.originalData.notebook.title;
      const noteCount = trashedItem.originalData.notes.length;
      preview = `${noteCount} note${noteCount !== 1 ? 's' : ''}`;
    } else {
      title = trashedItem.originalData.title || 'Untitled Note';
      const textContent = this.stripHtmlTags(trashedItem.originalData.content);
      preview = textContent.length > 100 
        ? textContent.substring(0, 100) + '...' 
        : textContent || 'No content';
    }

    trashDiv.innerHTML = `
      <div class="trash-item-header">
        <div class="trash-item-title">${this.escapeHtml(title)}</div>
        <span class="trash-item-type">${trashedItem.type}</span>
      </div>
      <div class="trash-item-preview">${this.escapeHtml(preview)}</div>
      <div class="trash-item-meta">
        <span class="trash-item-date">Deleted ${deletedDate}</span>
        <span class="trash-item-expiry">${expiryText}</span>
      </div>
      <div class="trash-item-actions">
        <button class="restore-btn" data-trashed-id="${trashedItem.id}">
          <i data-lucide="undo"></i>
          Restore
        </button>
        <button class="delete-permanently-btn" data-trashed-id="${trashedItem.id}">
          <i data-lucide="x"></i>
          Delete
        </button>
      </div>
    `;

    // Add event listeners
    const restoreBtn = trashDiv.querySelector('.restore-btn');
    const deleteBtn = trashDiv.querySelector('.delete-permanently-btn');

    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.restoreItem(trashedItem.id);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showCustomConfirmDialog(
        'Delete Permanently',
        `Are you sure you want to permanently delete "${title}"? This action cannot be undone.`,
        () => {
          this.deletePermanently(trashedItem.id);
        }
      );
    });

    // Add fade-in animation
    trashDiv.style.opacity = '0';
    trashDiv.style.transform = 'translateY(20px)';

    setTimeout(() => {
      trashDiv.style.transition = 'all 0.3s ease';
      trashDiv.style.opacity = '1';
      trashDiv.style.transform = 'translateY(0)';
    }, 50);

    return trashDiv;
  }

  restoreItem(trashedId) {
    const trashedItem = this.trashedItems.find(item => item.id === trashedId);
    if (!trashedItem) return;

    if (trashedItem.type === 'notebook') {
      // Restore notebook and its notes
      const { notebook, notes } = trashedItem.originalData;

      // Update timestamps
      notebook.updatedAt = new Date().toISOString();
      notes.forEach(note => {
        note.updatedAt = new Date().toISOString();
      });

      this.notebooks.unshift(notebook);
      this.notes.unshift(...notes);
    } else {
      // Restore note
      const note = trashedItem.originalData;
      note.updatedAt = new Date().toISOString();
      this.notes.unshift(note);
    }

    // Remove from trash
    this.trashedItems = this.trashedItems.filter(item => item.id !== trashedId);

    // Save and update UI
    this.saveNotes();
    this.saveNotebooks();
    this.saveTrashedItems();
    this.renderNotesList();
    this.renderTrashList();
    this.updateDeskView();

    this.showAutoSaveIndicator('saved');
  }

  deletePermanently(trashedId) {
    this.trashedItems = this.trashedItems.filter(item => item.id !== trashedId);
    this.saveTrashedItems();
    this.renderTrashList();
  }

  emptyTrash() {
    this.showCustomConfirmDialog(
      'Empty Trash',
      `Are you sure you want to permanently delete all ${this.trashedItems.length} items in trash? This action cannot be undone.`,
      () => {
        this.trashedItems = [];
        this.saveTrashedItems();
        this.renderTrashList();
      }
    );
  }

  cleanupExpiredTrashItems() {
    const now = new Date();
    const initialCount = this.trashedItems.length;

    this.trashedItems = this.trashedItems.filter(item => {
      const expiryDate = new Date(item.expiresAt);
      return expiryDate > now;
    });

    if (this.trashedItems.length !== initialCount) {
      this.saveTrashedItems();
      console.log(`Cleaned up ${initialCount - this.trashedItems.length} expired trash items`);
    }
  }

  navigateDesk(direction) {
    const deskCards = document.getElementById('deskCards');
    const deskCardsWrapper = document.querySelector('.desk-cards-wrapper');

    if (!deskCards || !deskCardsWrapper || this.notebooks.length <= 3) return;

    const cardWidth = 280 + 24; // card width + gap
    const containerWidth = deskCardsWrapper.offsetWidth;
    const totalWidth = this.notebooks.length * cardWidth;

    // Calculate how much we can scroll
    const maxScrollLeft = Math.max(0, totalWidth - containerWidth);
    const scrollStep = cardWidth;

    let newScrollPosition = this.deskCurrentIndex * scrollStep;

    if (direction === 'next' && newScrollPosition < maxScrollLeft) {
      this.deskCurrentIndex++;
      newScrollPosition += scrollStep;
    } else if (direction === 'prev' && this.deskCurrentIndex > 0) {
      this.deskCurrentIndex--;
      newScrollPosition -= scrollStep;
    }

    // Ensure we don't scroll beyond bounds
    newScrollPosition = Math.min(maxScrollLeft, Math.max(0, newScrollPosition));

    const translateX = -newScrollPosition;
    deskCards.style.transform = `translateX(${translateX}px)`;

    this.updateDeskNavigation();
  }

  updateDeskNavigation() {
    const deskPrevBtn = document.getElementById('deskPrevBtn');
    const deskNextBtn = document.getElementById('deskNextBtn');
    const deskCards = document.getElementById('deskCards');
    const deskCardsWrapper = document.querySelector('.desk-cards-wrapper');

    if (!deskPrevBtn || !deskNextBtn || !deskCards || !deskCardsWrapper) return;

    if (this.notebooks.length <= 3) {
      // Hide navigation if we have 3 or fewer notebooks
      const deskNavButtons = document.getElementById('deskNavButtons');
      if (deskNavButtons) {
        deskNavButtons.classList.remove('show');
      }
      return;
    }

    const cardWidth = 280 + 24; // card width + gap
    const containerWidth = deskCardsWrapper.offsetWidth;
    const totalWidth = this.notebooks.length * cardWidth;
    const maxScrollLeft = Math.max(0, totalWidth - containerWidth);

    const currentScrollPosition = this.deskCurrentIndex * cardWidth;

    // Update button states
    deskPrevBtn.disabled = this.deskCurrentIndex <= 0;
    deskNextBtn.disabled = currentScrollPosition >= maxScrollLeft;

    // Reset index if it's out of bounds (e.g., after deleting notebooks)
    const maxIndex = Math.max(0, Math.floor(maxScrollLeft / cardWidth));
    if (this.deskCurrentIndex > maxIndex) {
      this.deskCurrentIndex = maxIndex;
      const translateX = -this.deskCurrentIndex * cardWidth;
      deskCards.style.transform = `translateX(${translateX}px)`;
    }

    // Show navigation buttons
    const deskNavButtons = document.getElementById('deskNavButtons');
    if (deskNavButtons) {
      deskNavButtons.classList.add('show');
    }
  }

  showPasswordManagerView() {
    const dashboard = document.getElementById('dashboardContainer');
    const passwordManagerView = document.getElementById('passwordManagerViewContainer');

    dashboard.style.transform = 'translateX(-100%)';
    dashboard.style.opacity = '0';

    setTimeout(() => {
      dashboard.style.display = 'none';
      dashboard.style.transform = '';
      dashboard.style.opacity = '';

      passwordManagerView.style.display = 'flex';
      passwordManagerView.classList.add('slide-in-right');

      this.filteredPasswords = [...this.passwords];
      this.renderPasswordList();
      
      // Clear search input
      const searchInput = document.getElementById('passwordSearchInput');
      if (searchInput) searchInput.value = '';
    }, 200);
  }

  renderPasswordList() {
    const passwordList = document.getElementById('passwordList');
    const emptyMessage = document.getElementById('emptyPasswordsMessage');

    if (!passwordList) return;

    const passwordsToShow = this.filteredPasswords.length ? this.filteredPasswords : this.passwords;

    if (passwordsToShow.length === 0) {
      passwordList.innerHTML = '';
      emptyMessage.style.display = 'flex';
      return;
    }

    emptyMessage.style.display = 'none';
    passwordList.innerHTML = '';

    passwordsToShow.forEach(password => {
      const passwordItem = this.createPasswordItemElement(password);
      passwordList.appendChild(passwordItem);
    });

    // Re-initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  createPasswordItemElement(password) {
    const item = document.createElement('div');
    item.className = 'password-item';
    item.dataset.passwordId = password.id;

    const strength = this.calculatePasswordStrength(password.password);
    const formattedDate = new Date(password.updatedAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });

    item.innerHTML = `
      <div class="password-item-header">
        <div class="password-item-info">
          <div class="password-item-icon">
            <i data-lucide="key"></i>
          </div>
          <div class="password-item-details">
            <h3 class="password-item-title">${this.escapeHtml(password.title)}</h3>
            ${password.url ? `<a href="${password.url}" target="_blank" class="password-item-url">${this.escapeHtml(password.url)}</a>` : ''}
          </div>
        </div>
        <div class="password-item-actions">
          <button class="password-action-small copy-btn" title="Copy Password" data-password="${password.password}">
            <i data-lucide="copy"></i>
          </button>
          <button class="password-action-small edit-btn" title="Edit Password" data-password-id="${password.id}">
            <i data-lucide="edit-2"></i>
          </button>
          <button class="password-action-small delete-btn" title="Delete Password" data-password-id="${password.id}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
      <div class="password-item-content">
        ${password.username ? `
          <div class="password-field">
            <div class="password-field-label">Username</div>
            <div class="password-field-value">${this.escapeHtml(password.username)}</div>
          </div>
        ` : ''}
        ${password.email ? `
          <div class="password-field">
            <div class="password-field-label">Email</div>
            <div class="password-field-value">${this.escapeHtml(password.email)}</div>
          </div>
        ` : ''}
        <div class="password-field">
          <div class="password-field-label">Password</div>
          <div class="password-field-value hidden" data-password="${password.password}">
            ${password.password}
          </div>
          <div class="password-strength-indicator">
            <div class="strength-bar">
              <div class="strength-fill ${strength.strength}"></div>
            </div>
            <span class="strength-text ${strength.strength}">${strength.strength.toUpperCase()}</span>
          </div>
        </div>
        ${password.notes ? `
          <div class="password-field">
            <div class="password-field-label">Notes</div>
            <div class="password-field-value">${this.escapeHtml(password.notes)}</div>
          </div>
        ` : ''}
        <div class="password-field">
          <div class="password-field-label">Last Updated</div>
          <div class="password-field-value">${formattedDate}</div>
        </div>
      </div>
    `;

    // Add event listeners
    const copyBtn = item.querySelector('.copy-btn');
    const editBtn = item.querySelector('.edit-btn');
    const deleteBtn = item.querySelector('.delete-btn');
    const passwordField = item.querySelector('.password-field-value[data-password]');

    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.copyToClipboard(password.password, 'Password');
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showEditPasswordModal(password);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showCustomConfirmDialog(
        'Delete Password',
        `Are you sure you want to delete the password for "${password.title}"?`,
        () => {
          this.deletePassword(password.id);
        }
      );
    });

    // Toggle password visibility
    passwordField.addEventListener('click', () => {
      passwordField.classList.toggle('hidden');
    });

    return item;
  }

  showAddPasswordModal() {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Add New Password</h2>
          <p class="modal-subtitle">Store a new password securely</p>
        </div>
        <form class="modal-form" id="addPasswordForm">
          <div class="form-group">
            <label class="form-label" for="passwordTitle">Title*</label>
            <input 
              type="text" 
              id="passwordTitle" 
              class="form-input" 
              placeholder="e.g., Facebook, Gmail, Work Account"
              required
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="passwordUrl">Website URL</label>
            <input 
              type="url" 
              id="passwordUrl" 
              class="form-input" 
              placeholder="https://example.com"
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="passwordUsername">Username</label>
            <input 
              type="text" 
              id="passwordUsername" 
              class="form-input" 
              placeholder="Username or account name"
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="passwordEmail">Email</label>
            <input 
              type="email" 
              id="passwordEmail" 
              class="form-input" 
              placeholder="Email address"
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="passwordValue">Password*</label>
            <div style="display: flex; gap: 0.5rem;">
              <input 
                type="password" 
                id="passwordValue" 
                class="form-input" 
                placeholder="Enter or generate password"
                required
                autocomplete="off"
                style="flex: 1;"
              >
              <button type="button" id="togglePasswordVisibility" class="modal-btn modal-btn-secondary" style="flex: 0 0 auto; padding: 0.75rem;">
                <i data-lucide="eye"></i>
              </button>
              <button type="button" id="generatePasswordInModal" class="modal-btn modal-btn-secondary" style="flex: 0 0 auto; padding: 0.75rem;">
                <i data-lucide="refresh-cw"></i>
              </button>
            </div>
            <div id="passwordStrengthIndicator" style="margin-top: 0.5rem; display: none;">
              <div class="password-strength-indicator">
                <div class="strength-bar">
                  <div class="strength-fill" id="modalStrengthFill"></div>
                </div>
                <span class="strength-text" id="modalStrengthText">WEAK</span>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="passwordNotes">Notes</label>
            <textarea 
              id="passwordNotes" 
              class="form-input" 
              placeholder="Additional notes or information"
              rows="3"
              style="resize: vertical; min-height: 80px;"
            ></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="cancelAddPasswordBtn">Cancel</button>
            <button type="submit" class="modal-btn modal-btn-primary" id="savePasswordBtn">Save Password</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Focus on input
    setTimeout(() => {
      const input = document.getElementById('passwordTitle');
      if (input) input.focus();
    }, 300);

    this.bindPasswordModalEvents(modalOverlay);
  }

  showEditPasswordModal(password) {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Edit Password</h2>
          <p class="modal-subtitle">Update password information</p>
        </div>
        <form class="modal-form" id="editPasswordForm">
          <div class="form-group">
            <label class="form-label" for="editPasswordTitle">Title*</label>
            <input 
              type="text" 
              id="editPasswordTitle" 
              class="form-input" 
              value="${this.escapeHtml(password.title)}"
              required
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="editPasswordUrl">Website URL</label>
            <input 
              type="url" 
              id="editPasswordUrl" 
              class="form-input" 
              value="${this.escapeHtml(password.url || '')}"
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="editPasswordUsername">Username</label>
            <input 
              type="text" 
              id="editPasswordUsername" 
              class="form-input" 
              value="${this.escapeHtml(password.username || '')}"
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="editPasswordEmail">Email</label>
            <input 
              type="email" 
              id="editPasswordEmail" 
              class="form-input" 
              value="${this.escapeHtml(password.email || '')}"
              autocomplete="off"
            >
          </div>
          <div class="form-group">
            <label class="form-label" for="editPasswordValue">Password*</label>
            <div style="display: flex; gap: 0.5rem;">
              <input 
                type="password" 
                id="editPasswordValue" 
                class="form-input" 
                value="${this.escapeHtml(password.password)}"
                required
                autocomplete="off"
                style="flex: 1;"
              >
              <button type="button" id="editTogglePasswordVisibility" class="modal-btn modal-btn-secondary" style="flex: 0 0 auto; padding: 0.75rem;">
                <i data-lucide="eye"></i>
              </button>
              <button type="button" id="editGeneratePasswordInModal" class="modal-btn modal-btn-secondary" style="flex: 0 0 auto; padding: 0.75rem;">
                <i data-lucide="refresh-cw"></i>
              </button>
            </div>
            <div id="editPasswordStrengthIndicator" style="margin-top: 0.5rem;">
              <div class="password-strength-indicator">
                <div class="strength-bar">
                  <div class="strength-fill" id="editModalStrengthFill"></div>
                </div>
                <span class="strength-text" id="editModalStrengthText">WEAK</span>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="editPasswordNotes">Notes</label>
            <textarea 
              id="editPasswordNotes" 
              class="form-input" 
              rows="3"
              style="resize: vertical; min-height: 80px;"
            >${this.escapeHtml(password.notes || '')}</textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="cancelEditPasswordBtn">Cancel</button>
            <button type="submit" class="modal-btn modal-btn-primary" id="updatePasswordBtn">Update Password</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Initialize password strength
    setTimeout(() => {
      const passwordInput = document.getElementById('editPasswordValue');
      if (passwordInput) {
        this.updatePasswordStrengthIndicator(passwordInput.value, 'edit');
      }
    }, 100);

    this.bindPasswordModalEvents(modalOverlay, password);
  }

  showPasswordGeneratorModal() {
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">Password Generator</h2>
          <p class="modal-subtitle">Generate a secure password</p>
        </div>
        <div class="modal-form">
          <div class="form-group">
            <label class="form-label">Generated Password</label>
            <div style="display: flex; gap: 0.5rem;">
              <input 
                type="text" 
                id="generatedPassword" 
                class="form-input" 
                readonly
                style="flex: 1; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;"
              >
              <button type="button" id="copyGeneratedPassword" class="modal-btn modal-btn-secondary" style="flex: 0 0 auto; padding: 0.75rem;">
                <i data-lucide="copy"></i>
              </button>
              <button type="button" id="regeneratePassword" class="modal-btn modal-btn-secondary" style="flex: 0 0 auto; padding: 0.75rem;">
                <i data-lucide="refresh-cw"></i>
              </button>
            </div>
            <div id="generatorPasswordStrengthIndicator" style="margin-top: 0.5rem;">
              <div class="password-strength-indicator">
                <div class="strength-bar">
                  <div class="strength-fill" id="generatorStrengthFill"></div>
                </div>
                <span class="strength-text" id="generatorStrengthText">STRONG</span>
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">Length: <span id="lengthValue">16</span></label>
            <input 
              type="range" 
              id="passwordLength" 
              min="8" 
              max="128" 
              value="16"
              style="width: 100%;"
            >
          </div>
          
          <div class="form-group">
            <label class="form-label">Options</label>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.5rem; margin-top: 0.5rem;">
              <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-white); font-size: 0.875rem;">
                <input type="checkbox" id="includeUppercase" checked>
                Uppercase letters (A-Z)
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-white); font-size: 0.875rem;">
                <input type="checkbox" id="includeLowercase" checked>
                Lowercase letters (a-z)
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-white); font-size: 0.875rem;">
                <input type="checkbox" id="includeNumbers" checked>
                Numbers (0-9)
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-white); font-size: 0.875rem;">
                <input type="checkbox" id="includeSymbols" checked>
                Symbols (!@#$%^&*)
              </label>
              <label style="display: flex; align-items: center; gap: 0.5rem; color: var(--color-white); font-size: 0.875rem;">
                <input type="checkbox" id="excludeSimilar" checked>
                Exclude similar characters
              </label>
            </div>
          </div>
          
          <div class="modal-actions">
            <button type="button" class="modal-btn modal-btn-secondary" id="closeGeneratorBtn">Close</button>
            <button type="button" class="modal-btn modal-btn-primary" id="useGeneratedPasswordBtn">Use This Password</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    this.bindPasswordGeneratorEvents(modalOverlay);
  }

  bindPasswordModalEvents(modalOverlay, existingPassword = null) {
    const isEdit = !!existingPassword;
    const prefix = isEdit ? 'edit' : '';
    const form = document.getElementById(`${prefix}${isEdit ? 'P' : 'addP'}asswordForm`);
    const passwordInput = document.getElementById(`${prefix}${isEdit ? 'P' : 'p'}asswordValue`);
    const toggleBtn = document.getElementById(`${prefix}${isEdit ? 'T' : 't'}ogglePasswordVisibility`);
    const generateBtn = document.getElementById(`${prefix}${isEdit ? 'G' : 'g'}eneratePasswordInModal`);
    const cancelBtn = document.getElementById(`${prefix ? 'cancelEditPasswordBtn' : 'cancelAddPasswordBtn'}`);

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    // Password visibility toggle
    toggleBtn.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      toggleBtn.querySelector('i').setAttribute('data-lucide', type === 'password' ? 'eye' : 'eye-off');
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    });

    // Generate password
    generateBtn.addEventListener('click', () => {
      const newPassword = this.generatePassword(16);
      passwordInput.value = newPassword;
      this.updatePasswordStrengthIndicator(newPassword, prefix);
    });

    // Password strength indicator
    passwordInput.addEventListener('input', () => {
      this.updatePasswordStrengthIndicator(passwordInput.value, prefix);
    });

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const formData = {
        title: document.getElementById(`${prefix}${isEdit ? 'P' : 'p'}asswordTitle`).value.trim(),
        url: document.getElementById(`${prefix}${isEdit ? 'P' : 'p'}asswordUrl`).value.trim(),
        username: document.getElementById(`${prefix}${isEdit ? 'P' : 'p'}asswordUsername`).value.trim(),
        email: document.getElementById(`${prefix}${isEdit ? 'P' : 'p'}asswordEmail`).value.trim(),
        password: document.getElementById(`${prefix}${isEdit ? 'P' : 'p'}asswordValue`).value,
        notes: document.getElementById(`${prefix}${isEdit ? 'P' : 'p'}asswordNotes`).value.trim()
      };

      if (!formData.title || !formData.password) {
        alert('Title and password are required.');
        return;
      }

      if (isEdit) {
        this.updatePassword(existingPassword.id, formData);
      } else {
        this.addPassword(formData);
      }

      closeModal();
    });

    cancelBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // Initialize password strength for edit mode
    if (isEdit) {
      this.updatePasswordStrengthIndicator(passwordInput.value, prefix);
    }
  }

  bindPasswordGeneratorEvents(modalOverlay) {
    const lengthSlider = document.getElementById('passwordLength');
    const lengthValue = document.getElementById('lengthValue');
    const generatedPasswordInput = document.getElementById('generatedPassword');
    const copyBtn = document.getElementById('copyGeneratedPassword');
    const regenerateBtn = document.getElementById('regeneratePassword');
    const closeBtn = document.getElementById('closeGeneratorBtn');
    const useBtn = document.getElementById('useGeneratedPasswordBtn');

    const generateNewPassword = () => {
      const length = parseInt(lengthSlider.value);
      const options = {
        includeUppercase: document.getElementById('includeUppercase').checked,
        includeLowercase: document.getElementById('includeLowercase').checked,
        includeNumbers: document.getElementById('includeNumbers').checked,
        includeSymbols: document.getElementById('includeSymbols').checked,
        excludeSimilar: document.getElementById('excludeSimilar').checked
      };

      const password = this.generatePassword(length, options);
      generatedPasswordInput.value = password;
      this.updatePasswordStrengthIndicator(password, 'generator');
    };

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    // Initial password generation
    generateNewPassword();

    // Length slider
    lengthSlider.addEventListener('input', () => {
      lengthValue.textContent = lengthSlider.value;
      generateNewPassword();
    });

    // Option checkboxes
    ['includeUppercase', 'includeLowercase', 'includeNumbers', 'includeSymbols', 'excludeSimilar'].forEach(id => {
      document.getElementById(id).addEventListener('change', generateNewPassword);
    });

    // Copy password
    copyBtn.addEventListener('click', () => {
      this.copyToClipboard(generatedPasswordInput.value, 'Generated password');
    });

    // Regenerate password
    regenerateBtn.addEventListener('click', generateNewPassword);

    // Use password (opens add password modal)
    useBtn.addEventListener('click', () => {
      closeModal();
      setTimeout(() => {
        this.showAddPasswordModal();
        // Pre-fill the password
        setTimeout(() => {
          const passwordInput = document.getElementById('passwordValue');
          if (passwordInput) {
            passwordInput.value = generatedPasswordInput.value;
            this.updatePasswordStrengthIndicator(generatedPasswordInput.value, '');
          }
        }, 100);
      }, 300);
    });

    // Close button
    closeBtn.addEventListener('click', closeModal);

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  updatePasswordStrengthIndicator(password, prefix = '') {
    const strength = this.calculatePasswordStrength(password);
    const fillElement = document.getElementById(`${prefix}${prefix ? 'M' : 'm'}odalStrengthFill`);
    const textElement = document.getElementById(`${prefix}${prefix ? 'M' : 'm'}odalStrengthText`);
    const indicator = document.getElementById(`${prefix}${prefix ? 'P' : 'p'}asswordStrengthIndicator`);

    if (fillElement && textElement) {
      fillElement.className = `strength-fill ${strength.strength}`;
      textElement.className = `strength-text ${strength.strength}`;
      textElement.textContent = strength.strength.toUpperCase();
      
      if (indicator) {
        indicator.style.display = password ? 'block' : 'none';
      }
    }
  }

  // Custom confirm dialog
  showCustomConfirmDialog(title, message, onConfirm) {
    // Create modal overlay
    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-overlay confirm-modal';

    modalOverlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${this.escapeHtml(title)}</h2>
          <p class="modal-subtitle">${this.escapeHtml(message)}</p>
        </div>
        <div class="modal-actions">
          <button type="button" class="modal-btn modal-btn-secondary" id="cancelConfirmBtn">Cancel</button>
          <button type="button" class="modal-btn modal-btn-primary" id="confirmBtn">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(modalOverlay);

    // Show modal with animation
    setTimeout(() => {
      modalOverlay.classList.add('show');
    }, 10);

    // Handle actions
    const cancelBtn = document.getElementById('cancelConfirmBtn');
    const confirmBtn = document.getElementById('confirmBtn');

    const closeModal = () => {
      modalOverlay.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modalOverlay);
      }, 300);
    };

    // Event listeners
    cancelBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', () => {
      onConfirm();
      closeModal();
    });

    // Close on overlay click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Close on Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Add a small delay to ensure all elements are rendered
  setTimeout(() => {
    try {
      new NotesApp();

      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    } catch (error) {
      console.error('Error initializing NotesApp:', error);
    }
  }, 100);
});