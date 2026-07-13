# Mode Switcher Component

This file contains the reusable **Mode Switcher** component extracted from the application, designed to toggle between two states (e.g., App Mode / Admin Mode).

The design features a premium, realistic physical switch slider:
- An overlapping metallic-textured handle (`conic-gradient` + `radial-gradient` brushed metal effect).
- A smooth transition between deep blue (`#005ba5`) and vibrant purple (`#6f42c1`) track backgrounds.
- Tactile shadows and responsive adjustments.

---

## 1. React + CSS Modules (Recommended)

### Component: `ModeSwitcher.tsx`
```tsx
import React from 'react';
import styles from './ModeSwitcher.module.css';

interface ModeSwitcherProps {
  /** Current state of the toggle (true = Admin / checked, false = App / unchecked) */
  isAdminMode: boolean;
  /** Callback fired when the toggle state changes */
  onChange: (checked: boolean) => void;
  /** Label for the unchecked state (default: "App Mode") */
  leftLabel?: string;
  /** Label for the checked state (default: "Admin Mode") */
  rightLabel?: string;
  /** Unique ID for the input elements */
  id?: string;
}

export const ModeSwitcher: React.FC<ModeSwitcherProps> = ({
  isAdminMode,
  onChange,
  leftLabel = "App Mode",
  rightLabel = "Admin Mode",
  id = "admin-mode-toggle",
}) => {
  return (
    <div className={styles.modeToggleContainer}>
      <span className={`${styles.modeLabel} ${!isAdminMode ? styles.active : ''}`}>
        {leftLabel}
      </span>
      <div className={styles.toggleBorder}>
        <input
          id={id}
          type="checkbox"
          checked={isAdminMode}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id}>
          <div className={styles.handle}></div>
        </label>
      </div>
      <span className={`${styles.modeLabel} ${isAdminMode ? styles.active : ''}`}>
        {rightLabel}
      </span>
    </div>
  );
};
```

### Stylesheet: `ModeSwitcher.module.css`
```css
.modeToggleContainer {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin-right: 16px;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}

.modeToggleContainer .modeLabel {
  font-size: 0.875rem;
  font-weight: 500;
  color: #718096; /* Neutral text-muted equivalent */
  transition: color 0.3s ease;
  user-select: none;
}

.modeToggleContainer .modeLabel.active {
  color: #1a202c; /* Neutral active text equivalent */
  font-weight: 650;
}

.toggleBorder {
  border: 2px solid #f0ebeb;
  border-radius: 130px;
  padding: 1px 2px;
  background: linear-gradient(to bottom right, white, rgba(220, 220, 220, 0.5)), white;
  box-shadow: 0 0 0 2px #fbfbfb;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.toggleBorder input[type="checkbox"] {
  display: none;
}

.toggleBorder label {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 14px;
  background: #005ba5; /* Deep Blue track (unchecked) */
  border-radius: 80px;
  cursor: pointer;
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.3);
  transition: background 0.5s ease-in-out;
}

.toggleBorder input[type="checkbox"]:checked + label {
  background: #6f42c1; /* Vibrant Purple track (checked) */
}

.toggleBorder .handle {
  position: absolute;
  top: -4px;
  left: -4px;
  width: 22px;
  height: 22px;
  border: 1px solid #e5e5e5;
  background: repeating-radial-gradient(circle at 50% 50%, rgba(200, 200, 200, 0.2) 0%, rgba(200, 200, 200, 0.2) 2%, transparent 2%, transparent 3%, rgba(200, 200, 200, 0.2) 3%, transparent 3%), 
              conic-gradient(white 0%, silver 10%, white 35%, silver 45%, white 60%, silver 70%, white 80%, silver 95%, white 100%);
  border-radius: 50%;
  box-shadow: 2px 3px 6px 0 rgba(0, 0, 0, 0.3);
  transition: left 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
}

.toggleBorder input[type="checkbox"]:checked + label > .handle {
  left: calc(100% - 22px + 4px); /* Translates the handle to the right end */
}

/* Mobile Responsiveness styling */
@media (max-width: 600px) {
  .modeToggleContainer {
    margin-right: 0 !important;
    justify-content: center !important;
    width: 100% !important;
  }
}
```

---

## 2. React + Tailwind CSS

If you are using Tailwind CSS in your target project, you can use this self-contained React component. 

*Note: Since standard Tailwind classes do not cleanly generate complex repeating radial and conic gradients, the brushed-metal handle effect is handled using inline styles.*

### Component: `ModeSwitcherTailwind.tsx`
```tsx
import React from 'react';

interface ModeSwitcherProps {
  isAdminMode: boolean;
  onChange: (checked: boolean) => void;
  leftLabel?: string;
  rightLabel?: string;
  id?: string;
}

export const ModeSwitcherTailwind: React.FC<ModeSwitcherProps> = ({
  isAdminMode,
  onChange,
  leftLabel = "App Mode",
  rightLabel = "Admin Mode",
  id = "admin-mode-toggle",
}) => {
  return (
    <div className="inline-flex items-center gap-[10px] mr-4 max-[600px]:mr-0 max-[600px]:justify-center max-[600px]:w-full font-sans select-none">
      <span className={`text-[0.875rem] font-medium transition-colors duration-300 ${!isAdminMode ? 'text-gray-900 font-[650]' : 'text-gray-500'}`}>
        {leftLabel}
      </span>
      
      <div 
        className="border-2 border-[#f0ebeb] rounded-[130px] p-[1px_2px] shadow-[0_0_0_2px_#fbfbfb] cursor-pointer flex items-center"
        style={{ background: 'linear-gradient(to bottom right, white, rgba(220, 220, 220, 0.5)), white' }}
      >
        <input
          id={id}
          type="checkbox"
          className="hidden"
          checked={isAdminMode}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label 
          htmlFor={id}
          className={`relative inline-block w-[44px] h-[14px] rounded-[80px] cursor-pointer shadow-[inset_0_0_8px_rgba(0,0,0,0.3)] transition-colors duration-500 ${
            isAdminMode ? 'bg-[#6f42c1]' : 'bg-[#005ba5]'
          }`}
        >
          <div 
            className="absolute top-[-4px] w-[22px] h-[22px] border border-[#e5e5e5] rounded-full shadow-[2px_3px_6px_0_rgba(0,0,0,0.3)] transition-[left] duration-400 cubic-bezier(0.25, 0.8, 0.25, 1)"
            style={{
              left: isAdminMode ? 'calc(100% - 22px + 4px)' : '-4px',
              background: `
                repeating-radial-gradient(circle at 50% 50%, rgba(200,200,200,0.2) 0%, rgba(200,200,200,0.2) 2%, transparent 2%, transparent 3%, rgba(200,200,200,0.2) 3%, transparent 3%), 
                conic-gradient(white 0%, silver 10%, white 35%, silver 45%, white 60%, silver 70%, white 80%, silver 95%, white 100%)
              `
            }}
          />
        </label>
      </div>
      
      <span className={`text-[0.875rem] font-medium transition-colors duration-300 ${isAdminMode ? 'text-gray-900 font-[650]' : 'text-gray-500'}`}>
        {rightLabel}
      </span>
    </div>
  );
};
```

---

## 3. Plain HTML + CSS

For vanilla JavaScript or static site environments.

### HTML Markup
```html
<div class="mode-toggle-container">
  <span class="mode-label active" id="mode-label-left">App Mode</span>
  <div class="toggle-border">
    <input type="checkbox" id="admin-mode-toggle" />
    <label htmlFor="admin-mode-toggle">
      <div class="handle"></div>
    </label>
  </div>
  <span class="mode-label" id="mode-label-right">Admin Mode</span>
</div>

<script>
  const toggle = document.getElementById('admin-mode-toggle');
  const leftLabel = document.getElementById('mode-label-left');
  const rightLabel = document.getElementById('mode-label-right');

  toggle.addEventListener('change', (e) => {
    if (e.target.checked) {
      leftLabel.classList.remove('active');
      rightLabel.classList.add('active');
      // Perform your custom action here, e.g. redirecting or changing viewport state
      console.log("Switched to Admin Mode");
    } else {
      leftLabel.classList.add('active');
      rightLabel.classList.remove('active');
      console.log("Switched to App Mode");
    }
  });
</script>
```

### CSS stylesheet
*(Same styling rules as defined in section 1)*
