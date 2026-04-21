# Privacy Policy – AI Energy Monitor

**Last updated:** March 2026

## Overview

AI Energy Monitor is a browser extension that estimates the energy consumption (Wh) of AI chatbot usage. It is designed with privacy as a core principle: all data is stored locally on your device and never transmitted to external servers.

## Data Collection

The extension collects the following data **locally on your device only**:

- **Session duration** on supported AI platforms (e.g. ChatGPT, Gemini, Copilot, Claude, Perplexity, DeepSeek, Grok, Meta AI, Poe)
- **Estimated energy consumption** (Wh) calculated from session duration and prompts
- **User preferences** such as onboarding status and selected energy source

The extension does **not** collect:

- Personal information (name, email, address, etc.)
- Browsing history beyond supported AI platforms
- Authentication data or credentials
- Location data
- Financial or health information

## Data Storage

All data is stored locally using the Chrome `storage.local` API. No data is sent to any server, cloud service, or third party.

## Data Sharing

We do not sell, transfer, or share any user data with third parties. No data leaves your device.

## Permissions

The extension requests the following permissions, each strictly necessary for its core functionality:

| Permission | Purpose |
|---|---|
| `storage` | Store usage data and settings locally on your device |
| `webNavigation` | Detect navigation to supported AI platforms to start tracking |
| `notifications` | Show optional local notifications about energy consumption |
| `idle` | Pause tracking when the user is inactive for accurate measurements |
| `tabs` | Identify the active tab to attribute energy usage to the correct session |
| Host permissions | Inject content scripts on supported AI platforms to detect chat interactions |

## Remote Code

This extension does not use any remote code. All code is bundled within the extension package.

## Optional Dashboard Export

Users may optionally export a weekly aggregated Wh value (total energy consumption only) for use in a team dashboard. This export is initiated manually by the user and contains no personal data or chat content.

## Changes to This Policy

If we update this privacy policy, we will revise the "Last updated" date at the top of this page.

## Contact

If you have questions about this privacy policy, please open an issue on the [GitHub repository](https://github.com/MoAv16/ai-energy-tracker-extension).
