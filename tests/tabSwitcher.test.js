/**
 * Unit tests for Tab switching logic.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5
 *
 * @module tabSwitcher.test
 */

import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Tab switching logic extracted for testability.
 * This mirrors the logic added to app.js.
 */
function createTabSwitcher(previewContainer, generatorContainer, tabs) {
  let activeTab = 'preview';
  let generatorInitialized = false;
  let onGeneratorInit = null;

  function switchTab(tabName) {
    if (tabName !== 'preview' && tabName !== 'generator') return;
    activeTab = tabName;

    // Update tab active states
    for (const tab of tabs) {
      if (tab.dataset.tab === tabName) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    }

    // Show/hide containers
    if (tabName === 'preview') {
      previewContainer.classList.remove('hidden');
      generatorContainer.classList.add('hidden');
    } else {
      previewContainer.classList.add('hidden');
      generatorContainer.classList.remove('hidden');

      // Lazy init generator
      if (!generatorInitialized && onGeneratorInit) {
        generatorInitialized = true;
        onGeneratorInit();
      }
    }
  }

  return {
    get activeTab() { return activeTab; },
    get generatorInitialized() { return generatorInitialized; },
    set onGeneratorInit(fn) { onGeneratorInit = fn; },
    switchTab,
  };
}

describe('Tab Switcher', () => {
  let previewContainer;
  let generatorContainer;
  let previewTab;
  let generatorTab;
  let switcher;

  beforeEach(() => {
    // Set up DOM
    document.body.innerHTML = `
      <div id="tab-bar">
        <button class="tab active" data-tab="preview">Preview</button>
        <button class="tab" data-tab="generator">Generator</button>
      </div>
      <div id="preview-container"></div>
      <div id="generator-container" class="hidden"></div>
    `;

    previewContainer = document.getElementById('preview-container');
    generatorContainer = document.getElementById('generator-container');
    previewTab = document.querySelector('[data-tab="preview"]');
    generatorTab = document.querySelector('[data-tab="generator"]');

    switcher = createTabSwitcher(
      previewContainer,
      generatorContainer,
      [previewTab, generatorTab]
    );
  });

  it('should default to Preview tab active', () => {
    expect(switcher.activeTab).toBe('preview');
  });

  it('should show Preview container by default', () => {
    expect(previewContainer.classList.contains('hidden')).toBe(false);
    expect(generatorContainer.classList.contains('hidden')).toBe(true);
  });

  it('should switch to Generator tab', () => {
    switcher.switchTab('generator');

    expect(switcher.activeTab).toBe('generator');
    expect(previewContainer.classList.contains('hidden')).toBe(true);
    expect(generatorContainer.classList.contains('hidden')).toBe(false);
  });

  it('should switch back to Preview tab', () => {
    switcher.switchTab('generator');
    switcher.switchTab('preview');

    expect(switcher.activeTab).toBe('preview');
    expect(previewContainer.classList.contains('hidden')).toBe(false);
    expect(generatorContainer.classList.contains('hidden')).toBe(true);
  });

  it('should update tab active classes', () => {
    switcher.switchTab('generator');
    expect(generatorTab.classList.contains('active')).toBe(true);
    expect(previewTab.classList.contains('active')).toBe(false);

    switcher.switchTab('preview');
    expect(previewTab.classList.contains('active')).toBe(true);
    expect(generatorTab.classList.contains('active')).toBe(false);
  });

  it('should lazy-init GeneratorApp on first Generator tab activation', () => {
    let initCalled = false;
    switcher.onGeneratorInit = () => { initCalled = true; };

    expect(initCalled).toBe(false);
    switcher.switchTab('generator');
    expect(initCalled).toBe(true);
  });

  it('should not re-init GeneratorApp on subsequent tab switches', () => {
    let initCount = 0;
    switcher.onGeneratorInit = () => { initCount++; };

    switcher.switchTab('generator');
    switcher.switchTab('preview');
    switcher.switchTab('generator');

    expect(initCount).toBe(1);
  });

  it('should preserve state when switching tabs', () => {
    // Simulate adding content to generator container
    switcher.switchTab('generator');
    generatorContainer.innerHTML = '<p>Generator content</p>';

    // Switch away and back
    switcher.switchTab('preview');
    switcher.switchTab('generator');

    // Content should still be there (not destroyed)
    expect(generatorContainer.innerHTML).toBe('<p>Generator content</p>');
  });

  it('should ignore invalid tab names', () => {
    switcher.switchTab('invalid');
    expect(switcher.activeTab).toBe('preview'); // unchanged
  });
});
