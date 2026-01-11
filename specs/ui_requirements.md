# UI Requirements: Mode & Layout States

This document defines the expected UI behaviors and layout states for the application, specifically focusing on "Launcher Mode" vs "Normal Mode" and Sidebar visibility.

## 1. Global States

| State | Description |
| :--- | :--- |
| **Normal Mode** | Standard application window. Full features enabled. |
| **Launcher Mode** | Compact, floating window. Optimized for quick interactions. |

## 2. Component Visibility Matrix

### 2.1 Sidebar Container
The main navigation sidebar (History, New Chat).

| Mode | Mobile (<768px) | Desktop (>=768px) |
| :--- | :--- | :--- |
| **Normal** | **Overlay** (Hidden by default, toggled via button) | **Side-by-Side** (Visible by default, collapsible) |
| **Launcher** | **HIDDEN** (Never rendered) | **HIDDEN** (Never rendered) |

### 2.2 Sidebar Toggle Button (Header)
The hamburger menu icon in the top-left of the header (`CommonHeader` and Main App Header).

| Mode | Mobile | Desktop | Note |
| :--- | :--- | :--- | :--- |
| **Normal** | **VISIBLE** | **VISIBLE** | Allows users to toggle sidebar in both overlay and side-by-side layouts. |
| **Launcher** | **HIDDEN** | **HIDDEN** | Sidebar is not available in Launcher mode, so toggle must be hidden. |

### 2.3 Header Design
Common header used in Settings, File Explorer, Command Manager, and Main Chat.

| Feature | Normal Mode | Launcher Mode |
| :--- | :--- | :--- |
| **Height** | `h-14` (Standard) | `h-11` (Compact) |
| **Drag Region** | No | Yes (`data-tauri-drag-region`) |
| **Padding** | `px-6` | `px-3` |
| **Sidebar Toggle**| Visible | **Hidden** |

## 3. Layout Adjustments

### 3.1 Chat Input Area
- **Normal Mode**: Standard padding and max-width.
- **Launcher Mode**: Condensed padding. Ensure input area does not break visually in narrow/short windows.

### 3.2 Floating Windows (Settings/Files/Commands)
- **Normal Mode**: Full-screen overlay (absolute inset-0) or Modal.
- **Launcher Mode**: Full-screen overlay within the compact window. Headers must match Launcher Compact style.

## 4. Implementation Checklist
- [ ] **CommonHeader**: Update toggle button visibility logic. (`isLauncher ? 'hidden' : 'flex'`)
- [ ] **App.tsx Main Header**: Update toggle button visibility logic.
- [ ] **Sidebar**: Ensure it is strictly unmounted or hidden in Launcher mode.
- [ ] **Chat Layout**: Fix broken styling in Launcher mode (verify margins/padding).
